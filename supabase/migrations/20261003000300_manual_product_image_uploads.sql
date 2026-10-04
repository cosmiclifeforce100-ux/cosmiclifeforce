-- Preserve the existing product_images table while allowing manually uploaded product records.
alter table public.product_images
  drop constraint if exists product_images_image_type_check;

alter table public.product_images
  add constraint product_images_image_type_check
  check (image_type in ('primary', 'thumbnail', 'gallery', 'lifestyle', 'product'));
