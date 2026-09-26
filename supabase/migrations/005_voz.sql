-- Mensagem de voz dos noivos: toca quando o convidado abre o envelope.
-- Mesmo esquema das fotos: leitura pública, cada casal só mexe na própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios', 'audios', true, 3145728, array['audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav'];

drop policy if exists "casal sobe audio na própria pasta" on storage.objects;
create policy "casal sobe audio na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "casal troca audio da própria pasta" on storage.objects;
create policy "casal troca audio da própria pasta" on storage.objects
  for update to authenticated
  using (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "casal apaga audio da própria pasta" on storage.objects;
create policy "casal apaga audio da própria pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);
