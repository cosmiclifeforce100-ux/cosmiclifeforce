-- Cosmic Life Force: additive Supabase hardening.
-- Apply after schema.sql, or adapt table names to the already-existing project.
-- This migration does not drop tables, reset data, or expose service-role credentials.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role, is_active)
  values (new.id, new.email, 'customer', true)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_cosmic_life_force on auth.users;
create trigger on_auth_user_created_cosmic_life_force
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

alter table public.users enable row level security;
alter table public.business_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.manufacturers enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.bulk_prices enable row level security;
alter table public.product_images enable row level security;
alter table public.gallery_images enable row level security;
alter table public.inventory enable row level security;
alter table public.addresses enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.invoices enable row level security;
alter table public.delivery_photos enable row level security;
alter table public.delivery_photo_files enable row level security;
alter table public.reviews enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.notifications enable row level security;
alter table public.settings enable row level security;

drop policy if exists users_self_or_admin on public.users;
create policy users_self_or_admin on public.users for select using (id = auth.uid() or public.is_admin());

drop policy if exists business_profiles_self on public.business_profiles;
create policy business_profiles_self on public.business_profiles for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select using (active = true or public.is_admin());
drop policy if exists subcategories_public_read on public.subcategories;
create policy subcategories_public_read on public.subcategories for select using (exists (select 1 from public.categories c where c.id = category_id and c.active = true) or public.is_admin());
drop policy if exists manufacturers_public_read on public.manufacturers;
create policy manufacturers_public_read on public.manufacturers for select using (true);

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select using (active = true or public.is_admin());
drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants for select using ((active = true and exists (select 1 from public.products p where p.id = product_id and p.active = true)) or public.is_admin());
drop policy if exists bulk_prices_public_read on public.bulk_prices;
create policy bulk_prices_public_read on public.bulk_prices for select using (exists (select 1 from public.products p where p.id = product_id and p.active = true) or public.is_admin());

drop policy if exists product_images_verified_read on public.product_images;
create policy product_images_verified_read on public.product_images for select using ((active = true and verified = true and image_status = 'verified') or public.is_admin());
drop policy if exists product_images_admin_write on public.product_images;
create policy product_images_admin_write on public.product_images for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists gallery_images_verified_read on public.gallery_images;
create policy gallery_images_verified_read on public.gallery_images for select using ((active = true and verified = true and image_status = 'verified') or public.is_admin());
drop policy if exists gallery_images_admin_write on public.gallery_images;
create policy gallery_images_admin_write on public.gallery_images for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists inventory_admin_only on public.inventory;
create policy inventory_admin_only on public.inventory for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists addresses_self_or_admin on public.addresses;
create policy addresses_self_or_admin on public.addresses for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists carts_self_or_admin on public.carts;
create policy carts_self_or_admin on public.carts for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists cart_items_self_or_admin on public.cart_items;
create policy cart_items_self_or_admin on public.cart_items for all using (exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = auth.uid() or public.is_admin()))) with check (exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = auth.uid() or public.is_admin())));

drop policy if exists orders_self_or_admin on public.orders;
create policy orders_self_or_admin on public.orders for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists orders_customer_insert on public.orders;
create policy orders_customer_insert on public.orders for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists order_items_self_or_admin on public.order_items;
create policy order_items_self_or_admin on public.order_items for select using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
drop policy if exists order_status_self_or_admin on public.order_status_history;
create policy order_status_self_or_admin on public.order_status_history for select using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
drop policy if exists order_status_admin_write on public.order_status_history;
create policy order_status_admin_write on public.order_status_history for insert with check (public.is_admin());

drop policy if exists quotations_self_or_admin on public.quotations;
create policy quotations_self_or_admin on public.quotations for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists quotation_items_self_or_admin on public.quotation_items;
create policy quotation_items_self_or_admin on public.quotation_items for all using (exists (select 1 from public.quotations q where q.id = quotation_id and (q.user_id = auth.uid() or public.is_admin()))) with check (exists (select 1 from public.quotations q where q.id = quotation_id and (q.user_id = auth.uid() or public.is_admin())));

drop policy if exists invoices_self_or_admin on public.invoices;
create policy invoices_self_or_admin on public.invoices for select using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
drop policy if exists invoices_admin_write on public.invoices;
create policy invoices_admin_write on public.invoices for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists delivery_photos_self_or_admin on public.delivery_photos;
create policy delivery_photos_self_or_admin on public.delivery_photos for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists delivery_photo_files_self_or_admin on public.delivery_photo_files;
create policy delivery_photo_files_self_or_admin on public.delivery_photo_files for all using (exists (select 1 from public.delivery_photos d where d.id = delivery_photo_id and (d.user_id = auth.uid() or public.is_admin()))) with check (exists (select 1 from public.delivery_photos d where d.id = delivery_photo_id and (d.user_id = auth.uid() or public.is_admin())));

drop policy if exists reviews_approved_read on public.reviews;
create policy reviews_approved_read on public.reviews for select using (status = 'approved' or user_id = auth.uid() or public.is_admin());
drop policy if exists reviews_self_insert on public.reviews;
create policy reviews_self_insert on public.reviews for insert with check (user_id = auth.uid());
drop policy if exists reviews_admin_update on public.reviews;
create policy reviews_admin_update on public.reviews for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists wishlists_self_or_admin on public.wishlists;
create policy wishlists_self_or_admin on public.wishlists for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists wishlist_items_self_or_admin on public.wishlist_items;
create policy wishlist_items_self_or_admin on public.wishlist_items for all using (exists (select 1 from public.wishlists w where w.id = wishlist_id and (w.user_id = auth.uid() or public.is_admin()))) with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and (w.user_id = auth.uid() or public.is_admin())));
drop policy if exists notifications_self_or_admin on public.notifications;
create policy notifications_self_or_admin on public.notifications for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists settings_admin_only on public.settings;
create policy settings_admin_only on public.settings for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', false),
  ('gallery-images', 'gallery-images', false),
  ('delivery-photos', 'delivery-photos', false)
on conflict (id) do nothing;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects for select using (
  (bucket_id = 'product-images' and exists (
    select 1 from public.product_images image
    where image.storage_key = name and image.active = true and image.verified = true and image.image_status = 'verified'
  ))
  or (bucket_id = 'gallery-images' and exists (
    select 1 from public.gallery_images image
    where image.storage_key = name and image.active = true and image.verified = true and image.image_status = 'verified'
  ))
  or public.is_admin()
);
drop policy if exists product_images_admin_write on storage.objects;
create policy product_images_admin_write on storage.objects for all using (bucket_id in ('product-images', 'gallery-images') and public.is_admin()) with check (bucket_id in ('product-images', 'gallery-images') and public.is_admin());
drop policy if exists delivery_photos_owner_insert on storage.objects;
create policy delivery_photos_owner_insert on storage.objects for insert with check (bucket_id = 'delivery-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists delivery_photos_owner_read on storage.objects;
create policy delivery_photos_owner_read on storage.objects for select using (bucket_id = 'delivery-photos' and ((storage.foldername(name))[1] = (select auth.uid()::text) or public.is_admin()));
drop policy if exists delivery_photos_owner_delete on storage.objects;
create policy delivery_photos_owner_delete on storage.objects for delete using (bucket_id = 'delivery-photos' and ((storage.foldername(name))[1] = (select auth.uid()::text) or public.is_admin()));
