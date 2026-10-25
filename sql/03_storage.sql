-- ═══════════════════════════════════════════════════════════════════════
-- PinPage — шаг 3 из 3: ограничения бакета «media».
-- Клиентские проверки размера и типа можно обойти, поэтому те же правила
-- задаём на стороне Storage: только картинки/видео/аудио, не больше 50 МБ.
-- SVG и HTML намеренно не разрешены.
-- ═══════════════════════════════════════════════════════════════════════
update storage.buckets
   set public = true,
       file_size_limit = 52428800,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
         'video/mp4', 'video/webm', 'video/quicktime',
         'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav',
         'audio/webm', 'audio/flac', 'audio/x-m4a']
 where id = 'media';
