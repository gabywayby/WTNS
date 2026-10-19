-- Remove outdated launch copy now that the pre-order period has ended.
update public.products
set description = 'Identity before everything.'
where slug = 'child-of-god'
  and description = 'Identity before everything. More details soon.';
