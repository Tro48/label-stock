/**
 * Текст CSV-файла. «CSV UTF-8» из Excel читается как есть, а старый «CSV (разделители — запятые)»
 * Excel сохраняет в Windows-1251: если файл не валиден как UTF-8, перечитываем в этой кодировке.
 */
export async function readCsvFile(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}
