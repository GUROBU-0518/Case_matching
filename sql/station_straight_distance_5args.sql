-- Apply only after reviewing the existing station_match master SQL.
-- This adds an overload and keeps the existing two-argument function intact.
CREATE OR REPLACE FUNCTION station_match.station_straight_distance(
  workplace_station_name text,
  person_station_name text,
  near_km double precision,
  middle_km double precision,
  far_km double precision
)
RETURNS TABLE (
  status text,
  workplace_group_code text,
  person_group_code text,
  workplace_display_name text,
  person_display_name text,
  straight_distance_km numeric,
  distance_band text,
  method text
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
BEGIN
  IF near_km IS NULL OR middle_km IS NULL OR far_km IS NULL
    OR near_km IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR middle_km IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR far_km IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR near_km < 0
    OR near_km >= middle_km
    OR middle_km >= far_km THEN
    RAISE EXCEPTION
      'Invalid station distance thresholds: expected 0 <= near_km < middle_km < far_km'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    base.status,
    base.workplace_group_code,
    base.person_group_code,
    base.workplace_display_name,
    base.person_display_name,
    base.straight_distance_km,
    (
      CASE
      WHEN base.straight_distance_km IS NULL THEN NULL
      WHEN base.straight_distance_km <= near_km THEN 'NEAR'
      WHEN base.straight_distance_km <= middle_km THEN 'MIDDLE'
      WHEN base.straight_distance_km <= far_km THEN 'FAR'
      ELSE 'VERY_FAR'
      END
    )::text,
    base.method
  FROM station_match.station_straight_distance(
    workplace_station_name,
    person_station_name
  ) AS base;
END;
$$;

-- Rollback:
-- DROP FUNCTION IF EXISTS station_match.station_straight_distance(
--   text, text, double precision, double precision, double precision
-- );
