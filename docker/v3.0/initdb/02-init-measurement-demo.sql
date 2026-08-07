CREATE SCHEMA IF NOT EXISTS measurement_demo;

CREATE TABLE IF NOT EXISTS measurement_demo.active_power_measurements (
  id bigint PRIMARY KEY,
  measurement_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  point_code varchar(100) NOT NULL,
  active_power numeric(18, 6) NOT NULL,
  voltage numeric(18, 6) NOT NULL,
  current numeric(18, 6) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_measurement_demo_time
  ON measurement_demo.active_power_measurements (measurement_time);

CREATE INDEX IF NOT EXISTS idx_measurement_demo_scope_time
  ON measurement_demo.active_power_measurements (organization_code, region_code, measurement_time);

INSERT INTO measurement_demo.active_power_measurements (
  id,
  measurement_time,
  region_code,
  organization_code,
  point_code,
  active_power,
  voltage,
  current,
  quality_code
)
SELECT
  sample_no,
  timestamptz '2026-07-01 00:00:00+08' + floor((sample_no - 1) / 64) * interval '15 minutes',
  CASE WHEN ((sample_no - 1) % 64) < 32 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN ((sample_no - 1) % 64) < 32 THEN 'ORG-A' ELSE 'ORG-B' END,
  'POINT-' || lpad((((sample_no - 1) % 64) + 1)::text, 3, '0'),
  round((72 + (sample_no % 17) * 0.35 + sin(floor((sample_no - 1) / 64)::numeric / 64 * 2 * pi()) * 12 + CASE WHEN ((sample_no - 1) % 64) < 32 THEN 0 ELSE 8 END)::numeric, 6),
  round((220 + sin(floor((sample_no - 1) / 64)::numeric / 64 * 2 * pi()) * 1.8)::numeric, 6),
  round(((72 + (sample_no % 17) * 0.35 + CASE WHEN ((sample_no - 1) % 64) < 32 THEN 0 ELSE 8 END) * 2.62)::numeric, 6),
  CASE
    WHEN sample_no % 997 = 0 THEN 'invalid'
    WHEN sample_no % 211 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 4096) AS sample_no
ON CONFLICT (id) DO UPDATE SET
  measurement_time = EXCLUDED.measurement_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  point_code = EXCLUDED.point_code,
  active_power = EXCLUDED.active_power,
  voltage = EXCLUDED.voltage,
  current = EXCLUDED.current,
  quality_code = EXCLUDED.quality_code;

COMMENT ON SCHEMA measurement_demo IS '课题验证使用的有限量测数据，不作为生产数据平台。';
COMMENT ON TABLE measurement_demo.active_power_measurements IS '固定 4096 条可复现有功功率样本，用于行字段控制、聚合和密态计算验证。';
