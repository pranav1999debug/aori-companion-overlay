
-- User profiles for onboarding personalization
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  age INTEGER,
  hobbies TEXT[] DEFAULT '{}',
  profession TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Known faces Aori can recognize
CREATE TABLE public.known_faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Environment memories from back camera
CREATE TABLE public.environment_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  description TEXT NOT NULL,
  location_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS since this is a personal companion app without authentication
