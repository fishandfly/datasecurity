-- Dedicated read-only dictionary views for 3.0 business fields.
-- The unified dictionary remains the only dictionary source of truth.

DO $$
DECLARE
  view_name text;
  type_code text;
  allowed_values text;
BEGIN
  FOR view_name, type_code, allowed_values IN
    SELECT * FROM (VALUES
      ('dict_resource_types', 'resource_type', 'measurement_table,aggregate_resource,existing_api'),
      ('dict_update_cycles', 'update_cycle', 'realtime,minute,hour'),
      ('dict_protection_levels', 'protection_level', 'l1,l2,l3'),
      ('dict_resource_statuses', 'resource_status', 'draft,enabled,disabled'),
      ('dict_security_levels', 'security_level', 'normal,internal,sensitive,important,core'),
      ('dict_sensitivity_types', 'sensitivity_type', 'identifier,operation_metric,ordinary'),
      ('dict_desensitization_modes', 'desensitization_mode', 'none,mask,hash,tokenize'),
      ('dict_api_access_modes', 'api_access_mode', 'direct,develop,orchestrate'),
      ('dict_api_statuses', 'api_status', 'draft,published,disabled'),
      ('dict_publish_statuses', 'publish_status', 'unpublished,publishing,success,failed'),
      ('dict_source_types', 'source_type', 'validation_database,existing_api,file_e,message_queue,ems,tmr,distribution_cloud,cable_monitor,weather,hvcable'),
      ('dict_source_statuses', 'source_status', 'unchecked,testing,connected,exception,disabled'),
      ('dict_ingest_execution_types', 'ingest_execution_type', 'connection_test,validation,tagging'),
      ('dict_ingest_results', 'ingest_result', 'success,partial,failed'),
      ('dict_subject_types', 'access_subject_type', 'internal_app,external_party'),
      ('dict_subject_statuses', 'access_subject_status', 'draft,enabled,disabled'),
      ('dict_policy_kinds', 'policy_kind', 'resource_profile,access_policy'),
      ('dict_output_modes', 'output_mode', 'detail,masked,aggregate,encrypted'),
      ('dict_policy_statuses', 'policy_status', 'draft,enabled,disabled'),
      ('dict_baseline_statuses', 'baseline_status', 'draft,enabled,disabled'),
      ('dict_decision_results', 'decision_result', 'allow,limit,deny'),
      ('dict_risk_levels', 'risk_level', 'normal,notice,medium,high,critical'),
      ('dict_risk_types', 'risk_type', 'unauthorized,high_frequency,off_hours,oversized_span,oversized_rows'),
      ('dict_risk_actions', 'risk_action', 'record,limit,deny,deny_alert'),
      ('dict_risk_event_statuses', 'risk_event_status', 'pending,processing,closed'),
      ('dict_crypto_key_statuses', 'crypto_key_status', 'pending_validation,enabled,disabled,expired'),
      ('dict_crypto_operations', 'crypto_operation', 'sum,mean'),
      ('dict_crypto_task_statuses', 'crypto_task_status', 'pending,running,success,failed'),
      ('dict_resource_roles', 'resource_role', 'primary,participant')
    ) AS dictionary_views(view_name, type_code, allowed_values)
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW public.%I AS
       SELECT id, "typeCode", "typeName", "dictValue", "dictValueName",
              "dictColor", "dictValueDescription", "dictValueAttr", "dictSort"
       FROM public."jcDictionaryItems"
       WHERE "typeCode" = %L
         AND "dictValue" = ANY (string_to_array(%L, '',''))',
      view_name,
      type_code,
      allowed_values
    );
  END LOOP;
END
$$;
