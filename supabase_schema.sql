-- Run this in your Supabase SQL Editor to set up the EHR Backend

CREATE TABLE IF NOT EXISTS public.health_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    report_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    raw_json JSONB NOT NULL,
    markdown_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.health_reports ENABLE ROW LEVEL SECURITY;

-- Policy for Select
CREATE POLICY "Users can view their own reports" ON public.health_reports
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for Insert
CREATE POLICY "Users can insert their own reports" ON public.health_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for Update
CREATE POLICY "Users can update their own reports" ON public.health_reports
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policy for Delete
CREATE POLICY "Users can delete their own reports" ON public.health_reports
    FOR DELETE USING (auth.uid() = user_id);

-- Chat Threads for Context Memory
CREATE TABLE IF NOT EXISTS public.chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    language_code TEXT DEFAULT 'en-IN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for chat_threads
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

-- Policies for Chat Threads
CREATE POLICY "Users can view their own threads" ON public.chat_threads
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own threads" ON public.chat_threads
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own threads" ON public.chat_threads
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own threads" ON public.chat_threads
    FOR DELETE USING (auth.uid() = user_id);
