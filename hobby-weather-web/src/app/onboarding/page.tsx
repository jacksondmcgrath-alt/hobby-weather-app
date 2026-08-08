"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import {
  getFallbackDisplayName,
  getOrCreateProfile,
  updateProfileDisplayName,
  type UserProfile,
} from "@/lib/profile";
import {
  ACTIVITY_META,
  DEFAULT_ENABLED_ACTIVITIES,
  activitiesByCategory,
  activityLabel,
} from "@/lib/activityMeta";
import { triggerPredictionGeneration } from "@/lib/triggerPredictionGeneration";
import {
  PageHeader,
  Card,
  SectionTitle,
  StatusMessage,
  Button,
  Badge,
  Panel,
} from "@/components/ui";

type LocationCandidate = {
  label: string;
  latitude: number;
  longitude: number;
  source: string;
};

const ONBOARDING_STEPS = [
  {
    number: 1,
    title: "Name",
    description: "Tell Lumora what to call you.",
  },
  {
    number: 2,
    title: "Home location",
    description: "Choose the first place Lumora should forecast.",
  },
  {
    number: 3,
    title: "Activities",
    description: "Pick what Lumora should recommend.",
  },
  {
    number: 4,
    title: "Comfort",
    description: "Tune your first personalization settings.",
  },
  {
    number: 5,
    title: "Generate",
    description: "Create your first recommendations.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, authLoading } = useUser();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");

  const [locationSearch, setLocationSearch] = useState("");
  const [locationCandidates, setLocationCandidates] = useState<LocationCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [searchingLocation, setSearchingLocation] = useState(false);

  const [homeLocationName, setHomeLocationName] = useState("");
  const [homeLatitude, setHomeLatitude] = useState("");
  const [homeLongitude, setHomeLongitude] = useState("");

  const [enabledActivities, setEnabledActivities] = useState<string[]>(
    DEFAULT_ENABLED_ACTIVITIES
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [step, setStep] = useState(1);

  const activityGroups = useMemo(() => activitiesByCategory(), []);

  const [bugTolerance, setBugTolerance] = useState(5);
  const [rainCaution, setRainCaution] = useState(6);
  const [heatSensitivity, setHeatSensitivity] = useState(7);
  const [windSensitivity, setWindSensitivity] = useState(6);

  useEffect(() => {
    if (!user) return;

    const currentUser = user;

    async function loadProfile() {
      try {
        const loadedProfile = await getOrCreateProfile(currentUser);
        setProfile(loadedProfile);
        setDisplayName(
          loadedProfile.display_name || getFallbackDisplayName(currentUser)
        );
      } catch (error) {
        console.error("Could not load onboarding profile:", error);
        setDisplayName(getFallbackDisplayName(currentUser));
      }
    }

    loadProfile();
  }, [user]);

  function toggleActivity(activity: string) {
    setEnabledActivities((current) =>
      current.includes(activity)
        ? current.filter((item) => item !== activity)
        : [...current, activity]
    );
  }

  async function searchForLocation() {
    setSearchingLocation(true);
    setErrorMessage("");
    setLocationCandidates([]);
    setSelectedCandidateIndex(0);

    if (locationSearch.trim() === "") {
      setErrorMessage("Enter a place, address, map link, or coordinates.");
      setSearchingLocation(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(locationSearch)}`
      );

      const result = await response.json();

      if (!response.ok) {
        setErrorMessage(result.error ?? "Could not search for location.");
        setSearchingLocation(false);
        return;
      }

      const results = result.results ?? [];
      setLocationCandidates(results);

      if (results.length === 0) {
        setErrorMessage("No matching locations found.");
      }
    } catch (error) {
      setErrorMessage("Could not search for location.");
    }

    setSearchingLocation(false);
  }

  function useSelectedCandidate() {
    const selected = locationCandidates[selectedCandidateIndex];

    if (!selected) return;

    setHomeLocationName(selected.label.split(",")[0] ?? selected.label);
    setHomeLatitude(String(selected.latitude));
    setHomeLongitude(String(selected.longitude));
  }

  async function useBrowserLocation() {
    setErrorMessage("");

    if (!navigator.geolocation) {
      setErrorMessage("Your browser does not support location detection.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHomeLocationName("Home");
        setHomeLatitude(String(position.coords.latitude));
        setHomeLongitude(String(position.coords.longitude));
      },
      () => {
        setErrorMessage("Could not get your current location.");
      }
    );
  }

  async function saveOrUpdateHomeLocation({
    userId,
    name,
    latitude,
    longitude,
    }: {
    userId: string;
    name: string;
    latitude: number;
    longitude: number;
    }) {
    const { data: existingHomeLocations, error: existingError } = await supabase
        .from("saved_locations")
        .select("id")
        .eq("user_id", userId)
        .eq("location_type", "Home")
        .limit(1);

    if (existingError) {
        throw existingError;
    }

    const existingHome = (existingHomeLocations ?? [])[0];

    if (existingHome?.id) {
        const { error } = await supabase
        .from("saved_locations")
        .update({
            name,
            latitude,
            longitude,
            location_type: "Home",
            water_type: "Not applicable",
            water_body_size: "Not applicable",
            wind_exposure: "Not applicable",
            notes: "Updated during onboarding.",
        })
        .eq("id", existingHome.id)
        .eq("user_id", userId);

        if (error) {
        throw error;
        }

        return;
    }

    const { error } = await supabase.from("saved_locations").insert({
        user_id: userId,
        name,
        latitude,
        longitude,
        location_type: "Home",
        water_type: "Not applicable",
        water_body_size: "Not applicable",
        wind_exposure: "Not applicable",
        notes: "Created during onboarding.",
    });

    if (error) {
        throw error;
    }
    }

  function validateStep(currentStep: number) {
    setErrorMessage("");

    if (currentStep === 1 && !displayName.trim()) {
        setErrorMessage("Please enter your name.");
        return false;
    }

    if (currentStep === 2) {
        const latitudeNumber = Number(homeLatitude);
        const longitudeNumber = Number(homeLongitude);

        if (Number.isNaN(latitudeNumber) || Number.isNaN(longitudeNumber)) {
        setErrorMessage("Please add a valid home forecast location.");
        return false;
        }
    }

    if (currentStep === 3 && enabledActivities.length === 0) {
        setErrorMessage("Choose at least one activity.");
        return false;
    }

    return true;
    }

    function goNext() {
    if (!validateStep(step)) {
        return;
    }

    setStep((current) => Math.min(current + 1, ONBOARDING_STEPS.length));
    }

    function goBack() {
    setErrorMessage("");
    setStep((current) => Math.max(current - 1, 1));
    }

    function finishLater() {
    router.push("/");
    }

  async function finishOnboarding() {
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    if (!user) {
      setErrorMessage("You must be logged in.");
      setSaving(false);
      return;
    }

    if (!displayName.trim()) {
      setErrorMessage("Please enter your name.");
      setSaving(false);
      return;
    }

    const latitudeNumber = Number(homeLatitude);
    const longitudeNumber = Number(homeLongitude);

    if (Number.isNaN(latitudeNumber) || Number.isNaN(longitudeNumber)) {
      setErrorMessage("Please add a valid home forecast location.");
      setSaving(false);
      return;
    }

    if (enabledActivities.length === 0) {
      setErrorMessage("Choose at least one activity.");
      setSaving(false);
      return;
    }

    try {
      await updateProfileDisplayName(user.id, displayName);

      await saveOrUpdateHomeLocation({
        userId: user.id,
        name: homeLocationName.trim() || "Home",
        latitude: latitudeNumber,
        longitude: longitudeNumber,
        });

      await supabase.from("app_preferences").upsert(
        {
            user_id: user.id,
            settings: {
            enabled_activities: enabledActivities,
            bug_tolerance: bugTolerance,
            rain_caution: rainCaution,
            running_heat_sensitivity: heatSensitivity,
            running_wind_sensitivity: windSensitivity,
            },
        },
        {
            onConflict: "user_id",
        }
        );

      await supabase
        .from("profiles")
        .update({
          onboarding_complete: true,
          onboarding_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      setMessage("Setup saved. Lumora is generating your first recommendations...");

      await triggerPredictionGeneration({
        force: true,
        reason: "onboarding_completed",
      });

      router.push("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not finish onboarding."
      );
      setSaving(false);
    }
  }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
    return (
      <>
        <PageHeader
          title="Welcome to Lumora"
          description="Log in first, then Lumora can help you set up your recommendations."
        />

        <Card className="mt-6">
          <p className="text-slate-300">
            Please log in on the Home page to continue onboarding.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="First setup"
        title="Welcome to Lumora"
        description="Set up the basics so Lumora can generate useful recommendations right away."
      />

      {message && (
        <StatusMessage type="success">
          {message}
        </StatusMessage>
      )}

      {errorMessage && (
        <StatusMessage type="error">
          {errorMessage}
        </StatusMessage>
      )}

      <OnboardingProgress currentStep={step} />

      <div className="mt-8 grid gap-6">
        {step === 1 && (
            <Card>
            <SectionTitle
                title="1. What should Lumora call you?"
                description="This is used for greetings and assistant-style recommendations."
            />

            <label className="mt-5 grid gap-1">
                <span className="text-sm text-slate-300">Display name</span>
                <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--brand-rgb))] focus:ring-2 focus:ring-[rgb(var(--brand-rgb)_/_0.18)]"
                />
            </label>
            </Card>
        )}
        {step === 2 && (
            <Card>
            <SectionTitle
                title="2. Add your home forecast location"
                description="Start with your home area. You can add activity-specific locations later."
                action={
                <Button type="button" variant="ghost" onClick={useBrowserLocation}>
                    Use my current location
                </Button>
                }
            />

            <Panel className="mt-5">
                <div className="grid gap-3">
                <input
                    type="text"
                    value={locationSearch}
                    onChange={(event) => setLocationSearch(event.target.value)}
                    placeholder="Search city, park, address, coordinates, or map link"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--brand-rgb))] focus:ring-2 focus:ring-[rgb(var(--brand-rgb)_/_0.18)]"
                />

                <Button
                    type="button"
                    variant="secondary"
                    disabled={searchingLocation}
                    onClick={searchForLocation}
                >
                    {searchingLocation ? "Searching..." : "Find location"}
                </Button>

                {locationCandidates.length > 0 && (
                    <div className="grid gap-3">
                    <label className="grid gap-1">
                        <span className="text-sm text-slate-300">Choose result</span>
                        <select
                        value={selectedCandidateIndex}
                        onChange={(event) =>
                            setSelectedCandidateIndex(Number(event.target.value))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none"
                        >
                        {locationCandidates.map((candidate, index) => (
                            <option
                            key={`${candidate.latitude}-${candidate.longitude}-${index}`}
                            value={index}
                            >
                            {candidate.label} ({candidate.source})
                            </option>
                        ))}
                        </select>
                    </label>

                    <Button type="button" onClick={useSelectedCandidate}>
                        Use selected location
                    </Button>
                    </div>
                )}
                </div>
            </Panel>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="grid gap-1 sm:col-span-1">
                <span className="text-sm text-slate-300">Name</span>
                <input
                    value={homeLocationName}
                    onChange={(event) => setHomeLocationName(event.target.value)}
                    placeholder="Home"
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none"
                />
                </label>

                <label className="grid gap-1">
                <span className="text-sm text-slate-300">Latitude</span>
                <input
                    value={homeLatitude}
                    onChange={(event) => setHomeLatitude(event.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none"
                />
                </label>

                <label className="grid gap-1">
                <span className="text-sm text-slate-300">Longitude</span>
                <input
                    value={homeLongitude}
                    onChange={(event) => setHomeLongitude(event.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none"
                />
                </label>
            </div>
            </Card>
        )}

        {step === 3 && (
            <Card>
            <SectionTitle
                title="3. Choose activities"
                description="Pick the activities Lumora should recommend. You can change these anytime."
            />

            <div className="mt-5 grid gap-5">
                {Object.entries(activityGroups).map(([category, activities]) => (
                <div key={category}>
                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {category}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {activities.map((activity) => {
                        const enabled = enabledActivities.includes(activity);
                        const meta = ACTIVITY_META[activity];

                        return (
                        <button
                            key={activity}
                            type="button"
                            onClick={() => toggleActivity(activity)}
                            className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                            enabled
                                ? "border-[rgb(var(--brand-rgb)_/_0.45)] bg-[rgb(var(--brand-rgb)_/_0.12)]"
                                : "border-slate-700/70 bg-white/[0.04] hover:bg-white/[0.07]"
                            }`}
                        >
                            <div>
                            <div className="font-semibold text-white">
                                {activityLabel(activity)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                                {meta?.category ?? "Activity"}
                            </div>
                            </div>

                            <Badge variant={enabled ? "info" : "neutral"}>
                            {enabled ? "On" : "Off"}
                            </Badge>
                        </button>
                        );
                    })}
                    </div>
                </div>
                ))}
            </div>
            </Card>
        )}

        {step === 4 && (
            <Card>
                <SectionTitle
                    title="4. Tune your comfort"
                    description="These quick settings help Lumora personalize your first recommendations. You can fine-tune more later."
                />

                <div className="mt-5 grid gap-5">
                    <label className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-300">
                        Bug tolerance
                        </span>

                        <span className="rounded-full bg-[rgb(var(--brand-rgb)_/_0.14)] px-3 py-1 text-sm font-bold text-white">
                        {bugTolerance}/10
                        </span>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={10}
                        value={bugTolerance}
                        onChange={(event) => setBugTolerance(Number(event.target.value))}
                    />

                    <div className="flex justify-between text-xs text-slate-500">
                        <span>I hate bugs</span>
                        <span>Bugs are fine</span>
                    </div>
                    </label>

                    <label className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-300">
                        Rain caution
                        </span>

                        <span className="rounded-full bg-[rgb(var(--brand-rgb)_/_0.14)] px-3 py-1 text-sm font-bold text-white">
                        {rainCaution}/10
                        </span>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={10}
                        value={rainCaution}
                        onChange={(event) => setRainCaution(Number(event.target.value))}
                    />

                    <div className="flex justify-between text-xs text-slate-500">
                        <span>Rain is okay</span>
                        <span>Avoid rain</span>
                    </div>
                    </label>

                    <label className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-300">
                        Heat sensitivity
                        </span>

                        <span className="rounded-full bg-[rgb(var(--brand-rgb)_/_0.14)] px-3 py-1 text-sm font-bold text-white">
                        {heatSensitivity}/10
                        </span>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={10}
                        value={heatSensitivity}
                        onChange={(event) => setHeatSensitivity(Number(event.target.value))}
                    />

                    <div className="flex justify-between text-xs text-slate-500">
                        <span>Heat is okay</span>
                        <span>I avoid heat</span>
                    </div>
                    </label>

                    <label className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-300">
                        Wind sensitivity
                        </span>

                        <span className="rounded-full bg-[rgb(var(--brand-rgb)_/_0.14)] px-3 py-1 text-sm font-bold text-white">
                        {windSensitivity}/10
                        </span>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={10}
                        value={windSensitivity}
                        onChange={(event) => setWindSensitivity(Number(event.target.value))}
                    />

                    <div className="flex justify-between text-xs text-slate-500">
                        <span>Wind is okay</span>
                        <span>I avoid wind</span>
                    </div>
                    </label>
                </div>
                </Card>
        )}

        {step === 5 && (
            <Card>
                <SectionTitle
                title="5. Generate recommendations"
                description="Lumora will use your setup to create your first forecast windows."
                />

                <Panel className="mt-5">
                <div className="grid gap-4">
                    <div>
                    <div className="text-sm font-semibold text-white">
                        You’re ready to generate recommendations.
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                        Lumora will use your name, home forecast location, selected
                        activities, and comfort preferences to create personalized activity
                        windows. This may take a few seconds.
                    </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-700/70 bg-white/[0.04] p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Location
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">
                        {homeLocationName || "Home"}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-700/70 bg-white/[0.04] p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Activities
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">
                        {enabledActivities.length} selected
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-700/70 bg-white/[0.04] p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Preferences
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">
                        Initial tuning set
                        </div>
                    </div>
                    </div>
                </div>
                </Panel>
            </Card>
            )}

        <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                type="button"
                variant="ghost"
                onClick={finishLater}
                disabled={saving}
                >
                Finish later
                </Button>

                <div className="flex flex-wrap gap-2">
                {step > 1 && (
                    <Button
                    type="button"
                    variant="secondary"
                    onClick={goBack}
                    disabled={saving}
                    >
                    Back
                    </Button>
                )}

                {step < ONBOARDING_STEPS.length ? (
                    <Button
                    type="button"
                    onClick={goNext}
                    disabled={saving}
                    >
                    Continue
                    </Button>
                ) : (
                    <Button
                    type="button"
                    onClick={finishOnboarding}
                    disabled={saving}
                    >
                    {saving ? "Setting up..." : "Finish setup"}
                    </Button>
                )}
                </div>
            </div>
            </Card>

      </div>
    </>
  );
}

function OnboardingProgress({
  currentStep,
}: {
  currentStep: number;
}) {
  const progress = (currentStep / ONBOARDING_STEPS.length) * 100;
  const current = ONBOARDING_STEPS[currentStep - 1];

  return (
    <Card className="mt-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[rgb(var(--brand-rgb))]">
            Step {currentStep} of {ONBOARDING_STEPS.length}
          </div>

          <h2 className="mt-1 text-xl font-semibold text-white">
            {current?.title}
          </h2>

          <p className="mt-1 text-sm text-slate-300">
            {current?.description}
          </p>
        </div>

        <div className="text-sm font-semibold text-slate-300">
          {Math.round(progress)}% complete
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-[rgb(var(--brand-rgb))] transition-all"
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      {/* Desktop step cards */}
      <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-5">
        {ONBOARDING_STEPS.map((item) => {
          const active = item.number === currentStep;
          const complete = item.number < currentStep;

          return (
            <div
              key={item.number}
              className={`rounded-xl border p-3 ${
                active
                  ? "border-[rgb(var(--brand-rgb)_/_0.45)] bg-[rgb(var(--brand-rgb)_/_0.12)]"
                  : complete
                    ? "border-green-500/30 bg-green-500/10"
                    : "border-slate-800 bg-white/[0.03]"
              }`}
            >
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {item.number}
              </div>

              <div className="mt-1 text-sm font-semibold text-white">
                {item.title}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile step dots */}
      <div className="mt-4 flex justify-center gap-2 sm:hidden">
        {ONBOARDING_STEPS.map((item) => {
          const active = item.number === currentStep;
          const complete = item.number < currentStep;

          return (
            <div
              key={item.number}
              className={`h-2 rounded-full transition-all ${
                active
                  ? "w-8 bg-[rgb(var(--brand-rgb))]"
                  : complete
                    ? "w-2 bg-green-400"
                    : "w-2 bg-slate-700"
              }`}
            />
          );
        })}
      </div>
    </Card>
  );
}