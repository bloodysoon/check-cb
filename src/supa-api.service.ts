export interface VideoModel {
  name: string;
  imageUrl: string;
  isOnline: boolean;
  id: number;
  status?: string;
  attempt?: number;
}


import { createClient } from '@supabase/supabase-js';
import * as ws from 'ws';

(globalThis as any).WebSocket = ws.WebSocket;

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY is not set');
  }

  return createClient(url, key);
}

export async function getModels(): Promise<VideoModel[]> {
  const supabase = createSupabaseClient();

  let allData: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('ChatModels')
      .select('*')
      .range(from, from + batchSize - 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error retrieving ChatModels:', error);
      return [];
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allData as VideoModel[];
}

export async function updateModelStatus(name: string, status?: string | null) {
  if (!name) throw new Error('Name is required');
  console.log('updateModelStatus:', { name, status });

  const [result] = await saveModels([{ name, status }]);
  console.log('updateModelStatus result:', { result });
  return result?.data || [];
}

export async function addModel(name: string, status?: string) {
  const supabase = createSupabaseClient();
  const payload: any = { name };
  if (status) payload.status = status;
  console.log('Upserting into ChatModels:', payload);
  const { data, error } = await supabase
    .from('ChatModels')
    .upsert(payload, { onConflict: 'name' })
    .select();
  console.log('Supabase upsert result:', { data, error });
  if (error) throw new Error(`Error adding model: ${error.message}`);
  return data;
}

export async function saveModels(models: { name: string; status?: string | null }[]) {
  const allModels = await getModels();
  console.log('saveModels: loaded db models', { totalDbModels: allModels.length });

  const supabase = createSupabaseClient();
  const byName = new Map<string, VideoModel[]>();

  for (const model of allModels) {
    if (!model.name?.trim()) continue;
    const key = model.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(model);
  }

  const results: any[] = [];
  for (const { name, status } of models) {
    const trimmedName = name?.trim();
    if (!trimmedName) {
      console.log('saveModels: skipping empty name', { name, status });
      continue;
    }
    const matching = byName.get(trimmedName.toLowerCase()) || [];
    console.log('saveModels: processing', { name, trimmedName, status, matchingCount: matching.length });

    if (matching.length > 0) {
      const update: any = {};
      if (status !== undefined) update.status = status;
      console.log('saveModels: updating', { trimmedName, ids: matching.map((model) => model.id), update });
      const { data, error } = await supabase
        .from('ChatModels')
        .update(update)
        .in('id', matching.map((model) => model.id))
        .select();
      console.log('saveModels: update result', { trimmedName, data, error });
      if (error) throw new Error(`Error saving ${trimmedName}: ${error.message}`);
      results.push({ name: trimmedName, action: 'updated', data });
    } else {
      const payload: any = { name: trimmedName };
      if (status !== undefined) payload.status = status;
      console.log('saveModels: upserting', { trimmedName, payload });
      const { data, error } = await supabase
        .from('ChatModels')
        .upsert(payload, { onConflict: 'name' })
        .select();
      console.log('saveModels: upsert result', { trimmedName, data, error });
      if (error) throw new Error(`Error adding ${trimmedName}: ${error.message}`);
      results.push({ name: trimmedName, action: 'upserted', data });
    }
  }

  return results;
}

export async function updateDbOnlineStatus(
  id: number,
  imageUrl: string,
  startedAt?: Date,
) {
  const supabase = createSupabaseClient();
  const { error } = await supabase
    .from('ChatModels')
    .update({ isOnline: true, imageUrl, startedAt })
    .eq('id', id);
  if (error) console.error('Error updating online status:', error);
}

export async function updateDbOnlineStatusToFalse(id: number) {
  const supabase = createSupabaseClient();
  const { error } = await supabase
    .from('ChatModels')
    .update({ isOnline: false })
    .eq('id', id);
  if (error) console.error('Error updating online status to false:', error);
}

export async function incrementAttemp(name: string) {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('ChatModels')
    .select('attempt')
    .eq('name', name)
    .maybeSingle();

  if (error) throw new Error(`Error reading attempt: ${error.message}`);
  if (!data) throw new Error(`Model not found: ${name}`);

  const current = (data as any).attempt ?? 0;
  const next = current + 1;

  const { data: updated, error: updateError } = await supabase
    .from('ChatModels')
    .update({ attempt: next })
    .eq('name', name)
    .select()
    .single();

  if (updateError) throw new Error(`Error updating attempt: ${updateError.message}`);
  return updated;
}
