// ATM 팀 로스터 — .claude/agents/*.md 프론트매터 미러(정본). 시뮬·인스펙터·이름표의 단일 소스.
// color: 캐릭터 의상/칩 색. zone: 오피스 존. perms: 이름표 권한 배지. tools: 인스펙터 원문.

export const ZONES = {
  ceo:      { label: 'CEO실',        tint: '#F59E0B' },
  hub:      { label: '매니저 허브',   tint: '#22D3EE' },
  research: { label: '리서치',       tint: '#3B82F6' },
  plan:     { label: '기획',         tint: '#A855F7' },
  prod:     { label: '제작',         tint: '#F97316' },
  qc:       { label: 'QC 체크포인트', tint: '#9CA3AF' },
  publish:  { label: '발행',         tint: '#22C55E' },
  metric:   { label: '성과',         tint: '#67E8F9' },
  meeting:  { label: '회의실',       tint: '#94A3B8' },
  lounge:   { label: '라운지',       tint: '#D4A373' },
};

export const ROSTER = {
  yj: {
    name: 'YJ (오유진)', file: null, model: 'human', color: '#F59E0B', zone: 'ceo',
    role: 'CEO — 최종 의사결정·승인', perms: 'CEO', tools: ['최종 승인', '유튜브 직접 업로드'],
    scope: '전 파이프라인 최종 승인(게이트 ①②) · 방향 설정 · 반려 권한',
  },
  manager: {
    name: 'atm-manager', file: 'atm-manager.md', model: 'sonnet', color: '#22D3EE', zone: 'hub',
    role: '콘텐츠 운영 매니저 — 파이프라인 지휘·조율·CEO 보고', perms: 'ALL', tools: ['(전체 도구 상속)'],
    scope: '에이전트 작업 배분·진행 관리·CEO 보고(현황/확인요청/다음단계)',
  },
  caleb: {
    name: 'caleb', file: 'atm-trend-research.md', model: 'sonnet', color: '#3B82F6', zone: 'research',
    role: '트렌드 리서치 — AI 툴·서비스·트렌드 동향', perms: 'Web+RW', tools: ['WebFetch', 'WebSearch', 'Read', 'Write', 'Glob'],
    scope: '경쟁 유튜브 모니터링 · AI 키워드 추적 · 주간 트렌드 리포트',
  },
  matt: {
    name: 'matt', file: 'atm-competitor-analysis.md', model: 'sonnet', color: '#3B82F6', zone: 'research',
    role: '경쟁사·기업 동향 — OpenAI·Anthropic·Google·xAI 추적', perms: 'Web+RW', tools: ['WebFetch', 'WebSearch', 'Read', 'Write'],
    scope: '주간 기업 동향 요약 (caleb과 병렬 실행)',
  },
  daniel: {
    name: 'daniel', file: 'atm-insight.md', model: 'sonnet', color: '#A855F7', zone: 'plan',
    role: '인사이트 — 리서치 종합 → 주제 Top 5', perms: 'RW', tools: ['Read', 'Write', 'Glob'],
    scope: '리서치+경쟁사 리포트 종합 분석 · 핵심 앵글 제안 · luke 피드백 수신',
  },
  joseph: {
    name: 'joseph', file: 'atm-content-plan.md', model: 'sonnet', color: '#22C55E', zone: 'plan',
    role: '콘텐츠 기획 — 주간 캘린더·채널 배분', perms: 'RW', tools: ['Read', 'Write', 'Glob'],
    scope: 'Top5 → 주간 콘텐츠 캘린더 → CEO 승인① 상신 → 제작 배분',
  },
  esther: {
    name: 'esther', file: 'atm-instagram.md', model: 'sonnet', color: '#FACC15', zone: 'prod',
    role: 'IG 카드뉴스 — 5장 구성안+이미지', perms: 'RW+🍌', tools: ['Read', 'Write', 'Glob', 'nanobanana:generate'],
    scope: '카드뉴스 구성·캡션·해시태그 (이미지 생성 1순위)',
  },
  ruth: {
    name: 'ruth', file: 'atm-design.md', model: 'sonnet', color: '#8B5CF6', zone: 'prod',
    role: '디자인·이미지 — 채널별 이미지 생성', perms: 'RW+🍌', tools: ['Read', 'Write', 'Glob', 'nanobanana:generate', 'nanobanana:edit'],
    scope: '썸네일·카드·뉴스레터 이미지 + 이미지_공유_매니페스트 관리',
  },
  angel: {
    name: 'angel', file: 'atm-youtube.md', model: 'sonnet', color: '#EF4444', zone: 'prod',
    role: '유튜브 스크립트 — 제목·썸네일 문구·설명란', perms: 'RW', tools: ['Read', 'Write', 'Glob'],
    scope: '영상 스크립트·타임스탬프·디스크립션 일괄 작성',
  },
  joas: {
    name: 'joas', file: 'atm-blog.md', model: 'sonnet', color: '#F97316', zone: 'prod',
    role: '블로그(aitrend.kr) — SEO 포스트', perms: 'RW+🍌', tools: ['Read', 'Write', 'Glob', 'nanobanana:generate'],
    scope: 'SEO 최적화 포스트 + 본문 이미지 (Rank Math 90+)',
  },
  mark: {
    name: 'mark', file: 'atm-threads.md', model: 'sonnet', color: '#EC4899', zone: 'prod',
    role: 'Threads/X — 연속 스레드', perms: 'RW+🍌', tools: ['Read', 'Write', 'Glob', 'nanobanana:generate'],
    scope: '5챕터 스레드(챕터 400자) + 카드 캐로셀 (PT 발표식)',
  },
  john: {
    name: 'john', file: 'atm-newsletter.md', model: 'sonnet', color: '#14B8A6', zone: 'prod',
    role: '뉴스레터 — 주간 이메일', perms: 'RW+🍌', tools: ['Read', 'Write', 'Glob', 'nanobanana:generate'],
    scope: '뉴스레터 템플릿 기반 작성 + 섹션 이미지 (Stibee 발송)',
  },
  peter: {
    name: 'peter', file: 'atm-facebook.md', model: 'sonnet', color: '#60A5FA', zone: 'prod',
    role: '페이스북 — 페이지 콘텐츠', perms: 'RW', tools: ['Read', 'Write', 'Glob'],
    scope: '카드 공유·링크·텍스트 포스트 (이미지 재사용 우선)',
  },
  iris: {
    name: 'iris', file: 'atm-design-qc.md', model: 'opus', color: '#22D3EE', zone: 'qc',
    role: '디자인 QC·QA 총괄 — 발행 전 게이트', perms: 'R/W/Edit/Bash', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    scope: '전 디자인 산출물 v3/B type 가이드 검수(✅/⚠️/❌) · 가이드 고도화 권한 · 통과해야 발행 진입',
  },
  samuel: {
    name: 'samuel', file: 'atm-qc.md', model: 'sonnet', color: '#9CA3AF', zone: 'qc',
    role: '콘텐츠 QC — 순수 검수자(쓰기 권한 없음)', perms: 'R only', tools: ['Read', 'Glob'],
    scope: '브랜드 일관성·완성도·사실 정확성 검수 → 승인/수정요청 보고만',
  },
  publisher: {
    name: 'publisher', file: 'atm-publisher.md', model: 'sonnet', color: '#22C55E', zone: 'publish',
    role: '자동 발행 — 유일한 발행 실행권(Bash)', perms: 'RW+Bash', tools: ['Read', 'Write', 'Glob', 'Bash'],
    scope: 'Threads·IG·블로그 API 발행. QC 완료+CEO 승인② 후에만 실행',
  },
  luke: {
    name: 'luke', file: 'atm-analytics.md', model: 'sonnet', color: '#67E8F9', zone: 'metric',
    role: '성과 분석 — KPI·개선점·다음 전략', perms: 'RW', tools: ['Read', 'Write', 'Glob'],
    scope: '주간 성과 분석 → CEO 보고 → daniel(인사이트)로 피드백 루프',
  },
};

export const AGENT_IDS = Object.keys(ROSTER);
