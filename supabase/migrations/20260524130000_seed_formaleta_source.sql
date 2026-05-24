insert into public.supply_price_sources (
  supply_id,
  source_name,
  source_url,
  parse_config,
  is_active,
  priority
)
select
  sc.id,
  'fred_steel_formwork',
  'https://fred.stlouisfed.org/series/WPU101707',
  jsonb_build_object(
    'provider', 'fred',
    'series_id', 'WPU101707',
    'series_key', 'steel',
    'label', 'PPI: Iron and steel (US market proxy for metal formwork)',
    'price_unit', 'index',
    'keywords', jsonb_build_array('formaleta', 'formwork', 'metalica', 'metálica', 'steel', 'acero')
  ),
  true,
  1
from public.supply_catalog sc
where lower(sc.nombre) = lower('Formaleta metalica')
on conflict (supply_id, source_url)
do update set
  source_name = excluded.source_name,
  parse_config = excluded.parse_config,
  is_active = true,
  priority = excluded.priority,
  updated_at = now();
