// Модуль поиска исторических изображений через бесплатный Wikimedia Commons API (без ключа)
// Используется ТОЛЬКО для предмета «История» (костюмы, портреты, карты)

// Стоп-слова в именах файлов и описаниях для строгой детской безопасности (12+)
const IMAGE_BLACKLIST = [
  'nude',
  'nsfw',
  'erotic',
  'naked',
  'porn',
  'sex',
  'lingerie',
  'bikini',
  'topless',
  'genital',
  'violence',
  'gore',
  'blood',
  'обнаж',
  'эротик',
  'порно',
  'голый',
  'голая'
];

// Проверка URL и заголовка файла на безопасность
export function isSafeHistoricalImage(item) {
  if (!item || !item.url) return false;
  const combined = `${item.title || ''} ${item.url || ''} ${item.description || ''}`.toLowerCase();

  // Пропускаем запрещённые слова
  if (IMAGE_BLACKLIST.some((word) => combined.includes(word))) {
    return false;
  }

  // Пропускаем технические форматы (pdf, djvu, webm, ogg и т.д.) — оставляем только картинки
  if (!/\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(item.url)) {
    return false;
  }

  return true;
}

// Очистка HTML-тегов из метаданных Wikimedia
function stripHtml(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

// Поиск реальных изображений в Wikimedia Commons
// Запрос: https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=<q>&gsrnamespace=6&prop=imageinfo&iiprop=url&format=json&gsrlimit=6&origin=*
export async function searchHistoryImages(query, limit = 3) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  // Проверяем сам поисковый запрос на стоп-слова
  if (IMAGE_BLACKLIST.some((w) => cleanQuery.toLowerCase().includes(w))) {
    return [];
  }

  const endpoint =
    'https://commons.wikimedia.org/w/api.php' +
    `?action=query` +
    `&generator=search` +
    `&gsrsearch=${encodeURIComponent(cleanQuery)}` +
    `&gsrnamespace=6` +
    `&prop=imageinfo` +
    `&iiprop=url|extmetadata` +
    `&iiurlwidth=640` +
    `&format=json` +
    `&gsrlimit=${Math.max(limit * 2, 6)}` +
    `&origin=*`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Wikimedia HTTP ${res.status}`);
    }
    const json = await res.json();
    const pages = Object.values(json?.query?.pages || {});

    const results = [];
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      if (!info?.url) continue;

      const meta = info.extmetadata || {};
      const title = (page.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
      const description = stripHtml(meta.ImageDescription?.value || meta.ObjectName?.value || '');
      const candidate = {
        title,
        url: info.thumburl || info.url,
        fullUrl: info.url,
        description,
        source: 'Wikimedia Commons'
      };

      if (isSafeHistoricalImage(candidate)) {
        results.push(candidate);
      }

      if (results.length >= limit) break;
    }

    return results;
  } catch (err) {
    console.warn('[Синапс] Ошибка поиска Wikimedia Commons:', err?.message || err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Готовые безопасные поисковые запросы по векам для шаблонов истории
export const ERA_IMAGE_QUERIES = {
  medieval: 'medieval tunic costume manuscript painting',
  renaissance: 'renaissance portrait doublet costume 16th century',
  baroque: '18th century baroque rococo dress coat portrait',
  nineteenth: '19th century crinoline tailcoat fashion portrait',
  twentieth: '1920s 1960s fashion vintage dress suit museum'
};
