-- Lumora Beta Health Check
-- Run sections manually in Supabase SQL Editor as needed.
-- These queries are read-only.

-- ------------------------------------------------------------
-- 1. Recent user onboarding/setup status
-- ------------------------------------------------------------

select
  left(p.user_id::text, 8) as user_short,
  p.display_name,
  p.onboarding_complete,
  p.onboarding_completed_at,
  p.created_at as profile_created_at,
  exists (
    select 1
    from public.saved_locations sl
    where sl.user_id = p.user_id
      and sl.location_type = 'Home'
  ) as has_home_location,
  exists (
    select 1
    from public.app_preferences ap
    where ap.user_id = p.user_id
  ) as has_preferences,
  (
    select count(*)
    from public.user_predictions up
    where up.user_id = p.user_id
      and up.date::date >= current_date
      and up.date::date <= current_date + interval '14 days'
  ) as current_prediction_count,
  (
    select max(generated_at)
    from public.user_predictions up
    where up.user_id = p.user_id
  ) as latest_prediction_generated_at,
  (
    select count(*)
    from public.planned_activities pa
    where pa.user_id = p.user_id
  ) as plan_count,
  (
    select count(*)
    from public.activity_logs al
    where al.user_id = p.user_id
  ) as log_count
from public.profiles p
order by p.created_at desc
limit 25;


-- ------------------------------------------------------------
-- 2. Prediction generation health
-- ------------------------------------------------------------

select
  id,
  created_at,
  run_source,
  status,
  users_processed,
  predictions_written,
  error_message
from public.prediction_pipeline_runs
order by created_at desc
limit 30;


-- ------------------------------------------------------------
-- 3. Users with incomplete setup or missing current predictions
-- ------------------------------------------------------------

select
  left(p.user_id::text, 8) as user_short,
  p.display_name,
  p.onboarding_complete,
  exists (
    select 1
    from public.saved_locations sl
    where sl.user_id = p.user_id
      and sl.location_type = 'Home'
  ) as has_home_location,
  exists (
    select 1
    from public.app_preferences ap
    where ap.user_id = p.user_id
  ) as has_preferences,
  (
    select count(*)
    from public.user_predictions up
    where up.user_id = p.user_id
      and up.date::date >= current_date
      and up.date::date <= current_date + interval '14 days'
  ) as current_prediction_count
from public.profiles p
where p.onboarding_complete is distinct from true
   or not exists (
    select 1
    from public.saved_locations sl
    where sl.user_id = p.user_id
      and sl.location_type = 'Home'
   )
   or not exists (
    select 1
    from public.app_preferences ap
    where ap.user_id = p.user_id
   )
   or not exists (
    select 1
    from public.user_predictions up
    where up.user_id = p.user_id
      and up.date::date >= current_date
      and up.date::date <= current_date + interval '14 days'
   )
order by p.created_at desc;


-- ------------------------------------------------------------
-- 4. Recent app events
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  event_name,
  event_data,
  created_at
from public.app_events
order by created_at desc
limit 100;


-- ------------------------------------------------------------
-- 5. Event counts by user
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  count(*) as total_events,
  count(*) filter (where event_name = 'explore_saved_rank_run') as saved_rank_runs,
  count(*) filter (where event_name = 'explore_discovery_run') as discovery_runs,
  count(*) filter (where event_name = 'explore_discovered_location_saved') as discovered_locations_saved,
  count(*) filter (where event_name = 'explore_result_saved_as_plan') as explore_plans_saved,
  count(*) filter (where event_name = 'home_recommendation_saved_as_plan') as home_plans_saved,
  count(*) filter (where event_name = 'activity_log_created') as manual_logs_created,
  count(*) filter (where event_name = 'planned_activity_logged') as planned_logs_created,
  max(created_at) as latest_event_at
from public.app_events
where user_id is not null
group by user_id
order by latest_event_at desc;


-- ------------------------------------------------------------
-- 6. Recent failure/error events
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  event_name,
  event_data,
  created_at
from public.app_events
where event_name ilike '%fail%'
   or event_name ilike '%error%'
   or event_name ilike '%no_predictions%'
order by created_at desc
limit 50;


-- ------------------------------------------------------------
-- 7. Weather cache health
-- ------------------------------------------------------------

select
  data_type,
  source,
  job_source,
  count(*) as row_count,
  min(fetched_at) as oldest_fetched_at,
  max(fetched_at) as newest_fetched_at,
  min(expires_at) as oldest_expires_at,
  max(expires_at) as newest_expires_at,
  count(*) filter (where expires_at < now()) as expired_count
from public.environment_cache
group by data_type, source, job_source
order by newest_fetched_at desc nulls last;


-- ------------------------------------------------------------
-- 8. Current prediction score distribution by user/activity
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  activity,
  count(*) as rows,
  min(predicted_score) as min_score,
  round(avg(predicted_score), 1) as avg_score,
  max(predicted_score) as max_score,
  min(planning_score) as min_planning,
  round(avg(planning_score), 1) as avg_planning,
  max(planning_score) as max_planning,
  max(generated_at) as latest_generated_at
from public.user_predictions
where date::date >= current_date
  and date::date <= current_date + interval '14 days'
group by user_id, activity
order by user_short, avg_score desc;


-- ------------------------------------------------------------
-- 9. Preference adjustment distribution by user/activity
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  activity,
  min((feature_json->'score_components'->>'preference_adjustment')::numeric) as min_adjustment,
  round(avg((feature_json->'score_components'->>'preference_adjustment')::numeric), 1) as avg_adjustment,
  max((feature_json->'score_components'->>'preference_adjustment')::numeric) as max_adjustment,
  count(*) as rows
from public.user_predictions
where date::date >= current_date
  and date::date <= current_date + interval '14 days'
  and feature_json->'score_components'->>'preference_adjustment' is not null
group by user_id, activity
order by user_short, min_adjustment asc;


-- ------------------------------------------------------------
-- 10. Plans with planning-context snapshots
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  id,
  activity,
  planned_date,
  planned_window,
  location_name,
  score_at_planning,
  planning_score_at_planning,
  weather_snapshot_at_planning is not null as has_weather_snapshot,
  location_context_at_planning is not null as has_location_context,
  preference_snapshot_at_planning is not null as has_preference_snapshot,
  prediction_context_at_planning is not null as has_prediction_context,
  created_at
from public.planned_activities
order by created_at desc nulls last, id desc
limit 50;


-- ------------------------------------------------------------
-- 11. Logs with copied context
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  id,
  activity,
  date,
  planned_activity_id,
  actual_enjoyment_1_to_10,
  actual_score_0_to_100,
  weather_snapshot is not null as has_weather_snapshot,
  location_context is not null as has_location_context,
  preference_snapshot is not null as has_preference_snapshot,
  logged_at
from public.activity_logs
order by logged_at desc nulls last, id desc
limit 50;


-- ------------------------------------------------------------
-- 12. Saved locations by user
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  id,
  name,
  location_type,
  water_type,
  latitude,
  longitude,
  created_at
from public.saved_locations
order by created_at desc nulls last, id desc
limit 75;


-- ------------------------------------------------------------
-- 13. Enabled activities by user
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  settings->'enabled_activities' as enabled_activities
from public.app_preferences
order by user_id;


-- ------------------------------------------------------------
-- 14. Explore discovery outcomes
-- ------------------------------------------------------------

select
  left(user_id::text, 8) as user_short,
  event_name,
  event_data->>'activity' as activity,
  event_data->>'mode' as mode,
  event_data->>'radius_miles' as radius_miles,
  event_data->>'result_count' as result_count,
  created_at
from public.app_events
where event_name in (
  'explore_discovery_run',
  'explore_saved_rank_run',
  'explore_discovered_location_saved',
  'explore_result_saved_as_plan'
)
order by created_at desc
limit 75;