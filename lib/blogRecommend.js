// lib/blogRecommend.js

const SPONSOR_KEYWORDS = [
  '협찬', '체험단', '서포터즈', '원고료',
  '제공받아', '지원받아', '리뷰어로 선정', '무상으로 제공', '#광고',
];

function stripHtml(text = '') {
  return text.replace(/<[^>]*>/g, '');
}

export function isSponsored(post) {
  const text = stripHtml(post.title) + ' ' + stripHtml(post.description);
  return SPONSOR_KEYWORDS.some((kw) => text.includes(kw));
}

const reviewCache = new Map();

// Claude 응답이 ```json ... ``` 코드블록으로 감싸져 오는 경우를 대비해 벗겨내는 함수
function extractJson(raw) {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

export async function summarizeReviews(bookTitle, posts) {
  if (!posts || posts.length === 0) return null;

  const cacheKey = bookTitle;
  if (reviewCache.has(cacheKey)) {
    return reviewCache.get(cacheKey);
  }

  const snippets = posts
    .map((p, i) => `${i + 1}. ${stripHtml(p.title)}: ${stripHtml(p.description)}`)
    .join('\n');

  const prompt = `다음은 책 "${bookTitle}"에 대한 네이버 블로그 리뷰 스니펫 ${posts.length}개입니다.

${snippets}

이 내용을 바탕으로 아래 JSON 형식으로만 답해줘.
코드블록(백틱 3개, \`\`\`)으로 감싸지 말고, 다른 설명도 붙이지 말고, 순수 JSON 텍스트만 출력해줘.
{"recommendPercent": 0부터 100 사이 숫자, "summary": "20자 내외 한 줄 총평"}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error('Claude API error', await res.text());
      return null;
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    const parsed = JSON.parse(extractJson(raw));
    reviewCache.set(cacheKey, parsed);
    return parsed;
  } catch (e) {
    console.error('블로그 요약 실패:', e.message);
    return null;
  }
}