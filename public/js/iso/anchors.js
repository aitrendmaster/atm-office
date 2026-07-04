// 월드 좌표계(1920×1080) 앵커 — office_bg_v4.png(오픈플랜 23석, 파티션 없음) 캘리브레이션 2026-07-05.
// 측정: 0.55 배율 클린샷 실측, world = png × 1.818. 오픈플랜이라 데스크 전면=SE, 모니터=NW → face 전원 'l'.
// 좌석: 17 에이전트 + 스페어 4+(리서치·분석·제작 잉여) — CSS 보조책상 불필요(전부 실책상).

export const ANCHORS = {
  // CEO 유리방 (좌상)
  'desk:yj':        { x: 750, y: 292, face: 'l' },
  'anchor:ceo_front': { x: 745, y: 375 },
  // 매니저 스테이션 (CEO실·회의실 사이 오픈 데스크)
  'desk:manager':   { x: 910, y: 330, face: 'l' },
  'anchor:manager_q':  { x: 960, y: 400 },
  'anchor:manager_q2': { x: 1030, y: 365 },
  'anchor:manager_q3': { x: 880, y: 435 },
  // 회의실 (우상 유리 — 긴 테이블 남쪽)
  'anchor:meeting': { x: 1209, y: 340 },
  // 리서치 (좌측 3석 중 2석 사용: caleb=하단, matt=중단 / 상단=스페어)
  'desk:caleb':     { x: 327, y: 600, face: 'l' },
  'desk:matt':      { x: 445, y: 515, face: 'l' },
  // 성과·분석 누크 (차트월 2석 중 1석: luke / 우측=스페어)
  'desk:luke':      { x: 663, y: 614, face: 'l' },
  // 라운지 (좌하 소파·러그)
  'anchor:lounge':  { x: 418, y: 854 },
  // 기획 (공유 테이블 3석: daniel·joseph / 상단=samuel 검수석 전용)
  'desk:daniel':    { x: 818, y: 782, face: 'l' },
  'desk:joseph':    { x: 900, y: 742, face: 'l' },
  'desk:samuel':    { x: 982, y: 700, face: 'l' },
  // 제작 (오픈 그리드 9석 중 7석: 잉여 2석=스페어)
  'desk:esther':    { x: 1200, y: 518, face: 'l' },
  'desk:ruth':      { x: 1318, y: 455, face: 'l' },
  'desk:angel':     { x: 1436, y: 406, face: 'l' },
  'desk:joas':      { x: 1313, y: 609, face: 'l' },
  'desk:mark':      { x: 1431, y: 545, face: 'l' },
  'desk:john':      { x: 1549, y: 482, face: 'l' },
  'desk:peter':     { x: 1425, y: 700, face: 'l' },
  // QC 체크포인트 (게이트 옆)
  'desk:iris':      { x: 1082, y: 882, face: 'l' },
  'anchor:gate':    { x: 1036, y: 931 },
  // 발행 (서버랙 옆)
  'desk:publisher': { x: 1254, y: 818, face: 'l' },
};

export const ZONE_RECTS = {
  ceo:      { x: 620, y: 205, w: 240, h: 105 },
  hub:      { x: 930, y: 352, w: 230, h: 68 },
  meeting:  { x: 1090, y: 205, w: 320, h: 150 },
  research: { x: 235, y: 400, w: 330, h: 230 },
  metric:   { x: 560, y: 545, w: 260, h: 115 },
  lounge:   { x: 205, y: 705, w: 330, h: 215 },
  plan:     { x: 770, y: 800, w: 300, h: 105 },
  qc:       { x: 990, y: 905, w: 220, h: 75 },
  publish:  { x: 1190, y: 838, w: 250, h: 85 },
  prod:     { x: 1210, y: 385, w: 550, h: 355 },
};

// 웨이포인트 — 오픈플랜 넓은 통로
export const WAYPOINTS = {
  w_ceo:   { x: 830, y: 430 },
  w_top:   { x: 1000, y: 440 },
  w_mid:   { x: 980, y: 640 },
  w_left:  { x: 540, y: 680 },
  w_lounge:{ x: 500, y: 830 },
  w_bot:   { x: 980, y: 860 },
  w_right: { x: 1320, y: 760 },
  w_gate:  { x: 1036, y: 965 },
};
export const WP_EDGES = {
  w_ceo:   ['w_top', 'w_left', 'w_mid'],
  w_top:   ['w_ceo', 'w_mid', 'w_right'],
  w_mid:   ['w_ceo', 'w_top', 'w_left', 'w_bot', 'w_right'],
  w_left:  ['w_ceo', 'w_mid', 'w_lounge'],
  w_lounge:['w_left', 'w_bot'],
  w_bot:   ['w_mid', 'w_lounge', 'w_gate', 'w_right'],
  w_right: ['w_top', 'w_mid', 'w_bot'],
  w_gate:  ['w_bot'],
};

export function anchorOf(key) {
  if (ANCHORS[key]) return ANCHORS[key];
  return ANCHORS['anchor:manager_q'];
}
