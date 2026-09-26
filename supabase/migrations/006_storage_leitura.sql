-- O site sobe foto/áudio com "upsert" e depois lista a pasta pra apagar arquivos velhos.
-- As duas coisas exigem permissão de LEITURA na própria pasta, que faltava:
-- o upload dava 403 "new row violates row-level security policy" (medido em 26/09).
drop policy if exists "casal lê a própria pasta de fotos" on storage.objects;
create policy "casal lê a própria pasta de fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "casal lê a própria pasta de audios" on storage.objects;
create policy "casal lê a própria pasta de audios" on storage.objects
  for select to authenticated
  using (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);
