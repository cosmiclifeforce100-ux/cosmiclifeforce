-- Cosmic Life Force production relational schema.
-- PostgreSQL 15+. Image binaries belong in object storage; only metadata and URLs live here.

create extension if not exists pgcrypto;

create type user_role as enum ('customer', 'admin');
create type stock_status as enum ('not-configured', 'in-stock', 'out-of-stock');
create type purchase_mode as enum ('direct', 'quote', 'enquiry');
create type order_status as enum ('Order Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled');
create type quote_status as enum ('Pending', 'Reviewed', 'Price Sent', 'Accepted', 'Rejected', 'Completed');
create type moderation_status as enum ('pending', 'approved', 'rejected');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text,
  role user_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  mobile_number text not null,
  gst_number text,
  customer_type text not null,
  business_address text,
  verification_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_label text,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  slug text not null,
  unique(category_id, slug)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  manufacturer_id uuid not null references manufacturers(id),
  category_id uuid not null references categories(id),
  subcategory_id uuid references subcategories(id),
  brand text,
  description text,
  specifications jsonb not null default '{}'::jsonb,
  pack_size text,
  moq integer,
  price numeric(12,2),
  wholesale_price numeric(12,2),
  gst text,
  stock_status stock_status not null default 'not-configured',
  purchase_mode purchase_mode not null default 'quote',
  source_page integer,
  source_row_hash text,
  source_duplicate_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (moq is null or moq > 0),
  check (price is null or price >= 0),
  check (wholesale_price is null or wholesale_price >= 0)
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,
  sku text unique,
  price numeric(12,2),
  wholesale_price numeric(12,2),
  moq integer,
  active boolean not null default true
);

create table bulk_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  min_quantity integer not null,
  max_quantity integer,
  price numeric(12,2),
  wholesale_price numeric(12,2),
  unique(product_id, min_quantity),
  check (min_quantity > 0),
  check (max_quantity is null or max_quantity >= min_quantity)
);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  storage_key text not null,
  public_url text,
  alt_text text,
  image_type text not null default 'primary' check (image_type in ('primary', 'thumbnail', 'gallery', 'lifestyle')),
  source text not null default 'admin_upload',
  source_url text,
  verified boolean not null default false,
  image_status text not null default 'pending_review' check (image_status in ('verified', 'unverified', 'placeholder', 'pending_review', 'rejected')),
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table gallery_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  storage_key text not null,
  public_url text,
  category_label text,
  source text not null default 'admin_upload',
  source_url text,
  verified boolean not null default false,
  image_status text not null default 'pending_review' check (image_status in ('verified', 'unverified', 'placeholder', 'pending_review', 'rejected')),
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references products(id) on delete cascade,
  quantity integer,
  reserved_quantity integer not null default 0,
  status stock_status not null default 'not-configured',
  updated_at timestamptz not null default now(),
  check (quantity is null or quantity >= 0),
  check (reserved_quantity >= 0)
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text not null,
  address_line text not null,
  city text,
  state text,
  postal_code text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  session_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or session_key is not null)
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  quantity integer not null,
  unique(cart_id, product_id, variant_id),
  check (quantity > 0)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references users(id),
  business_profile_id uuid references business_profiles(id),
  billing_address_id uuid references addresses(id),
  shipping_address_id uuid references addresses(id),
  status order_status not null default 'Order Placed',
  payment_provider text,
  payment_reference text,
  subtotal numeric(12,2),
  gst_total numeric(12,2),
  shipping_total numeric(12,2),
  grand_total numeric(12,2),
  payment_status text not null default 'pending' check (payment_status in ('created', 'pending', 'paid', 'failed', 'refunded', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text not null unique,
  provider_payment_id text unique,
  provider_signature text,
  status text not null default 'created' check (status in ('created', 'pending', 'paid', 'failed', 'refunded', 'cancelled')),
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  webhook_event_id text unique,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  product_name_snapshot text not null,
  manufacturer_snapshot text not null,
  quantity integer not null,
  unit_price numeric(12,2),
  gst text,
  check (quantity > 0)
);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status order_status not null,
  note text,
  changed_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table quotations (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  user_id uuid references users(id),
  business_name text not null,
  contact_email text not null,
  phone text,
  customer_type text,
  message text,
  status quote_status not null default 'Pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null,
  quoted_unit_price numeric(12,2),
  check (quantity > 0)
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  order_id uuid not null unique references orders(id),
  storage_key text,
  public_url text,
  gst_number text,
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

create table delivery_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  rating integer,
  comment text,
  status moderation_status not null default 'pending',
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (rating is null or rating between 1 and 5)
);

create table delivery_photo_files (
  id uuid primary key default gen_random_uuid(),
  delivery_photo_id uuid not null references delivery_photos(id) on delete cascade,
  storage_key text not null,
  public_url text,
  sort_order integer not null default 0
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid references products(id),
  order_id uuid references orders(id),
  rating integer not null,
  comment text,
  status moderation_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (rating between 1 and 5)
);

create table wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade
);

create table wishlist_items (
  wishlist_id uuid not null references wishlists(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wishlist_id, product_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index products_category_active_idx on products(category_id, active);
create index products_manufacturer_idx on products(manufacturer_id);
create index products_name_search_idx on products using gin (to_tsvector('simple', name));
create index product_images_product_idx on product_images(product_id, sort_order);
create index gallery_images_active_sort_idx on gallery_images(active, sort_order);
create index inventory_status_idx on inventory(status);
create index addresses_user_idx on addresses(user_id);
create index orders_user_status_idx on orders(user_id, status);
create index orders_payment_status_idx on orders(payment_status, created_at);
create index payments_user_status_idx on payments(user_id, status, created_at);
create index payments_provider_payment_idx on payments(provider_payment_id);
create index order_status_history_order_idx on order_status_history(order_id, created_at);
create index quotations_user_status_idx on quotations(user_id, status);
create index delivery_photos_status_idx on delivery_photos(status, created_at);
create index delivery_photo_files_delivery_idx on delivery_photo_files(delivery_photo_id, sort_order);
create index reviews_product_status_idx on reviews(product_id, status);
create index notifications_user_read_idx on notifications(user_id, read_at);
