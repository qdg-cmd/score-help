// ═══════════════════════════════════════════════
// DATA STORE
// ═══════════════════════════════════════════════
let allStudents = {};
let currentStudent = null;
let checkedSubjects = new Set();
let trendChart = null;
let gradeSystemMax = 5; // 2028 개편 5등급제 고정
let currentFileType = 'neis'; // 'neis' | 'ilam'
const currentSchoolLevel = 'high'; // 'high' | 'middle'
let ilamData = null; // 전과목 성적 일람표 원본 데이터 (학생별 과목별 석차/수강자수)
let show9Grade = false; // 5등급→9등급 환산 표시 토글

// 5등급제 → 9등급제 환산 (등급 구간 커트라인 중첩 기준 대략치)
// 5등급 커트: 10/34/66/90% · 9등급 커트: 4/11/23/40/60/77/89/96%
const GRADE5_TO_9 = { 1:'1~2등급', 2:'3~4등급', 3:'5등급', 4:'6~7등급', 5:'8~9등급' };

// 컬럼 매핑 관련 상태
let lastSheetRows = {};
let lastFileName = '';

// ═══════════════════════════════════════════════
// HEADER ALIASES — 학교별 다양한 헤더명 지원
// ═══════════════════════════════════════════════
const HEADER_ALIASES = {
  num:     ['번호','연번','순번','no','num'],
  name:    ['성명','이름','학생명','성명(한글)','학생','학생이름'],
  subj:    ['과목','교과','과목명','교과목','교과명','세부과목명','세부과목'],
  rank:    ['석차등급','등급','석차/등급','성취등급','교과등급','석차(등급)','내신등급'],
  gradeYr: ['학년'],
  term:    ['학기'],
  score:   ['원점수','점수','원점수/과목평균'],
  dist:    ['분포비율','비율','성취도별분포비율'],
  achieve: ['성취도'],
  total:   ['수강자수','수강자','수강인원','수강자수(명)','성취도(수강자수)']
};
const ROLE_LABELS = { '':'-- 역할 선택 --', num:'번호', name:'성명', gradeYr:'학년', term:'학기', subj:'과목', rank:'석차등급', achieve:'성취도(A~E)', score:'원점수', dist:'분포비율', total:'수강자수', skip:'(무시)' };

function _norm(v) { return String(v||'').replace(/\s/g,'').toLowerCase(); }

function _matchAlias(cellVal, key) {
  const n = _norm(cellVal); if (!n) return false;
  const a = HEADER_ALIASES[key]; if (!a) return false;
  // '학점수'·'학점' 헤더가 '점수' 별칭에 걸리는 오감지 방지
  if (key==='score') return !n.includes('학점') && a.some(x => n.includes(x.toLowerCase()));
  if (key==='dist') return a.some(x => n.includes(x.toLowerCase()));
  return a.some(x => n === x.toLowerCase());
}

function autoDetectColumns(rows) {
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = rows[i]; if (!row) continue;
    const f = {};
    for (let c = 0; c < row.length; c++) {
      if (row[c]===''||row[c]===null||row[c]===undefined) continue;
      for (const k of Object.keys(HEADER_ALIASES)) { if (f[k]===undefined && _matchAlias(row[c],k)) f[k]=c; }
    }
    if (f.name!==undefined && f.subj!==undefined && (f.rank!==undefined||f.achieve!==undefined)) {
      // NS — '교과'와 '과목' 열이 둘 다 있으면 과목 열을 쓴다. 교과(국어·수학·사회…)로 읽으면
      //      같은 학기 같은 교과의 과목이 한 칸으로 뭉쳐 뒤의 과목이 사라진다.
      let nsArea = -1, nsUnit = -1;
      if (['교과','교과명'].includes(_norm(row[f.subj]))) {
        for (let c = 0; c < row.length; c++) {
          if (c !== f.subj && ['과목','과목명','교과목','세부과목','세부과목명'].includes(_norm(row[c]))) { nsArea = f.subj; f.subj = c; break; }
        }
      }
      for (let c = 0; c < row.length; c++) {
        if (['학점수','학점','단위수','이수단위','단위','학점(단위수)'].includes(_norm(row[c]))) { nsUnit = c; break; }
      }
      return { num:f.num??-1, name:f.name, grade:f.gradeYr??-1, term:f.term??-1, subj:f.subj, score:f.score??-1, rank:f.rank??-1, dist:f.dist??-1, achieve:f.achieve??-1, total:f.total??-1, unit:nsUnit, area:nsArea, headerRow:i };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// SCHOOL LEVEL SELECTOR
// ═══════════════════════════════════════════════
function selectSchoolLevel(level) { currentSchoolLevel = 'high'; updateFileTypeUI(currentFileType); }
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed
// removed

// ═══════════════════════════════════════════════
// SECTION TOGGLE
// ═══════════════════════════════════════════════
function ts(id) {
  document.getElementById(id).classList.toggle('collapsed');
}

// ═══════════════════════════════════════════════
// 학생 이름 유효성 검사 (실명, 가상데이터 학생1/학생2, 마스킹 김*수 등 포괄)
function isValidStudentName(name) {
  if (!name || typeof name !== 'string') return false;
  const s = name.trim();
  if (s.length < 2 || s.length > 10) return false;
  const skip = ['번호', '성명', '이름', '학생명', '합계', '평균', '원점수', '석차', '과목', '과목명', '학기', '학년', '비고', '이수학점'];
  if (skip.includes(s)) return false;
  return /^[가-힣a-zA-Z0-9*·_\s]+$/.test(s);
}

// FILE TYPE CHIP SELECTION
// ═══════════════════════════════════════════════
function updateFileTypeUI(type) {
  const hn = document.getElementById('hint-neis');
  const hi = document.getElementById('hint-ilam');
  if (hn) hn.style.display = (type === 'neis') ? 'block' : 'none';
  if (hi) hi.style.display = (type === 'ilam') ? 'block' : 'none';
}

function selectFileType(type) {
  currentFileType = type;
  document.getElementById('chip-neis').classList.toggle('active', type === 'neis');
  document.getElementById('chip-ilam').classList.toggle('active', type === 'ilam');
  updateFileTypeUI(type);
  // 업로드 존 안내 텍스트 변경
  const uz = document.getElementById('upload-zone');
  if (!uz.classList.contains('upload-done')) {
    document.getElementById('upload-title').textContent =
      type === 'neis' ? 'NEIS 교과학습발달상황 파일을 업로드하세요' : '전과목 성적 일람표 파일을 업로드하세요';
  }
}

// ═══════════════════════════════════════════════
// 전과목 성적 일람표 파서 (5등급제 / 9등급제 가상등급 산출)
// ═══════════════════════════════════════════════
// 5등급 커트라인 (누적 상위 비율, 고1~2 공통과목)
// 1등급:10% / 2등급:24% / 3등급:32% / 4등급:24% / 5등급:10%
const GRADE5_CUTS = [0.10, 0.34, 0.66, 0.90];

// 9등급 커트라인 (누적 상위 비율, 고3 선택과목)
// 1:4% / 2:7% / 3:12% / 4:17% / 5:20% / 6:17% / 7:12% / 8:7% / 9:4%
const GRADE9_CUTS = [0.04, 0.11, 0.23, 0.40, 0.60, 0.77, 0.89, 0.96];

function getGradeCuts(gradeSystem) {
  return gradeSystem === 9 ? GRADE9_CUTS : GRADE5_CUTS;
}

// 5·9등급 공통 가상등급 계산
function calcVirtualGrade(rank, tieCount, totalStudents, gradeSystem) {
  if (!rank || !totalStudents || totalStudents < 1) return null;
  // NS — 동석차는 중간석차 백분율로 매긴다 (학업성적관리 지침). 예전엔 동점자 중 맨 끝 석차를 써서 경계에서 한 등급 낮게 나왔다.
  const pct = (rank + ((tieCount || 1) - 1) / 2) / totalStudents;
  const cuts = getGradeCuts(gradeSystem);
  for (let g = 0; g < cuts.length; g++) {
    if (pct <= cuts[g]) return g + 1;
  }
  return gradeSystem;
}

// 구버전 호환 래퍼
function calcVirtualGrade5(rank, tieCount, totalStudents) {
  return calcVirtualGrade(rank, tieCount, totalStudents, 5);
}

// 등급제 자동 감지: 헤더 행에서 학년 또는 과목명으로 판별
// - "3학년" 또는 선택과목명(공통/한국사 아닌 것) → 9등급
// - "1학년"/"2학년" 또는 공통과목 → 5등급
// ═══════════════════════════════════════════════
// 고교 등급 체계 설정 (2028 개편 5등급제 / 기존 9등급제)
// ═══════════════════════════════════════════════
let customGradeSystemMode = 'force5'; // 2028 개편 5등급제 고정

function setGradeSystemMode(mode) {
  customGradeSystemMode = mode;
  ['auto', 'force5', 'force9'].forEach(m => {
    const el = document.getElementById('gsmode-' + m);
    if (el) el.classList.toggle('active', m === mode);
  });

  if (allStudents && Object.keys(allStudents).length > 0) {
    if (ilamData && Object.keys(ilamData).length > 0) {
      for (const [name, subjs] of Object.entries(ilamData)) {
        for (const [key, d] of Object.entries(subjs)) {
          if (!d.rank || !d.total) continue;
          let gs = (mode === 'force5') ? 5 : (mode === 'force9') ? 9 : (d.gradeSystem || 9);
          const vGrade = calcVirtualGrade(d.rank, d.tieCount || 1, d.total, gs);
          if (allStudents[name] && allStudents[name][key]) {
            allStudents[name][key].grade = vGrade;
            allStudents[name][key].gradeSystem = gs;
          }
        }
      }
    }
    buildTermGradeSystemMap();
    if (currentStudent) {
      generateAll();
    }
    const msg = mode === 'force5' ? '2028 개편 전면 5등급제로 재산출되었습니다.' :
                mode === 'force9' ? '기존 9등급제로 재산출되었습니다.' :
                '학년별 자동 판별 모드로 재산출되었습니다.';
    showToast(msg);
  }
}

function detectGradeSystem(rows) {
  if (customGradeSystemMode === 'force5') return 5;
  if (customGradeSystemMode === 'force9') return 9;

  const headerText = rows.slice(0, 5).map(r => (r||[]).join(' ')).join(' ');
  if (/3학년/.test(headerText)) return 9;
  if (/1학년|2학년/.test(headerText)) return 5;
  // 과목명으로 추정: 공통국어·공통수학·공통영어·한국사·통합사회·통합과학 → 5등급
  const subjRow = rows.slice(0, 8).find(r => (r||[]).some(v => /공통국어|공통수학|공통영어|통합사회|통합과학/.test(String(v||''))));
  if (subjRow) return 5;
  const NEW_SUBJ = /^(화법과언어|독서와작문|대수|미적분[Ⅰ1I]|세계시민과지리|사회와문화|현대사회와윤리|물리학|화학|생명과학|지구과학|역학과에너지|물질과에너지|세포와물질대사|지구시스템과학)$/;
  if (rows.slice(0, 8).some(r => (r||[]).some(v => NEW_SUBJ.test(String(v||'').replace(/\s/g, ''))))) return 5;
  // 선택과목명(문학, 수학Ⅱ 등) → 9등급
  return 9;
}

function parseRankStr(v) {
  // "39(3)" → { rank: 39, tieCount: 3, total: null }
  // "115(2)/147" → { rank: 115, tieCount: 2, total: 147 }
  // "133"   → { rank: 133, tieCount: 1, total: null }
  const s = String(v || '').trim();
  const m = s.match(/^(\d+)(?:\((\d+)\))?(?:\/(\d+))?/);
  if (!m) return null;
  return {
    rank: parseInt(m[1]),
    tieCount: m[2] ? parseInt(m[2]) : 1,
    total: m[3] ? parseInt(m[3]) : null
  };
}

function parseIlamFile(rows) {
  // ═══════════════════════════════════════════════════════════════════
  // 나이스(NEIS) 전과목 성적 일람표 파서 v3
  //
  // 핵심 전략: 컬럼 헤더 행에서 "원점수"/"석차"/"수강자수" 위치를
  //           동적으로 파싱 → 파일마다 다른 열 오프셋 완벽 대응
  //
  // 선택과목 공란 처리: parseRankStr 실패 시 해당 학생/과목 자동 스킵
  // 학생별로 실제 수강한 과목만 저장됨
  // ═══════════════════════════════════════════════════════════════════

  const students = {};

  const _s  = v => String(v == null ? '' : v).trim();
  const _ns = v => _s(v).replace(/\s/g, '');

  // 과목명 패턴: "문학(3)", "공통국어1(4)", "영어 독해와 작문(3)", "영어Ⅰ(3)" 등
  const SUBJ_PAT = /^([가-힣a-zA-ZⅠⅡⅢⅣ·\s]+\d*)\s*\(\d+\)/;
  const nsIlamUnits = {}; // NS — 「문학(3)」의 3이 학점
  function extractSubjectName(v) {
    const clean = _s(v).replace(/^\s+/, '');
    const m = clean.match(SUBJ_PAT);
    return m ? m[1].trim() : null;
  }

  function normalizeTerm(g, t) {
    return `${parseInt(g)||1}학년 ${parseInt(t)||1}학기`;
  }

  // 파일 상단에서 학년/학기 파싱
  let fileGrade = 1, fileTerm = 1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const rowStr = (rows[i]||[]).map(v=>_s(v)).join(' ');
    const gm = rowStr.match(/(\d)\s*학년/);
    const tm = rowStr.match(/제\s*(\d)\s*학기/);
    if (gm) fileGrade = parseInt(gm[1]);
    if (tm) fileTerm = parseInt(tm[1]);
  }
  const defaultTerm = normalizeTerm(fileGrade, fileTerm);

  // 등급제 결정
  const fileGradeSystem = detectGradeSystem(rows.slice(0, 5));
  console.log(`[일람표 파서 v3] ${fileGrade}학년 ${fileTerm}학기 → ${fileGradeSystem}등급제`);

  // ── 1단계: 과목헤더 행 위치 수집 ──────────────────────────────────
  const subjectHeaderRows = [];
  for (let i = 0; i < rows.length; i++) {
    const v0 = _ns((rows[i]||[])[0]);
    if (v0.includes('평가방법') && v0.includes('반영비율')) {
      subjectHeaderRows.push(i);
    }
  }
  if (subjectHeaderRows.length === 0) return {};

  // ── 2단계: 각 블록 파싱 ───────────────────────────────────────────
  for (let bi = 0; bi < subjectHeaderRows.length; bi++) {
    const subjRowIdx = subjectHeaderRows[bi];
    const nextSubjRowIdx = subjectHeaderRows[bi + 1] ?? rows.length;
    const subjRow = rows[subjRowIdx] || [];

    // 과목명과 시작 col 수집
    const subjects = [];
    for (let c = 2; c < subjRow.length; c++) {
      const name = extractSubjectName(subjRow[c]);
      if (name) { subjects.push({ name, startCol: c }); const nsU = _s(subjRow[c]).match(/\((\d+)\)/); if (nsU) nsIlamUnits[name] = parseInt(nsU[1], 10); } // NS
    }
    if (subjects.length === 0) continue;

    // 컬럼헤더 행 찾기
    let colHdrIdx = -1;
    for (let i = subjRowIdx + 1; i < Math.min(subjRowIdx + 5, nextSubjRowIdx); i++) {
      const rowStr = (rows[i]||[]).map(v=>_s(v)).join('|');
      if (rowStr.includes('원점수') || rowStr.includes('석차')) {
        colHdrIdx = i; break;
      }
    }
    if (colHdrIdx < 0) continue;

    const colHdrRow = rows[colHdrIdx] || [];

    // 학생 데이터 행 수집
    const dataRowIndices = [];
    for (let i = colHdrIdx + 1; i < nextSubjRowIdx; i++) {
      const r = rows[i] || [];
      const num = parseFloat(_s(r[0]));
      const name = _s(r[1]);
      if (!isNaN(num) && num >= 1 && num <= 300 && isValidStudentName(name)) {
        dataRowIndices.push(i);
      }
    }
    if (dataRowIndices.length === 0) continue;

    // ── 각 과목의 원점수/석차/수강자수 열 위치 동적 파싱 ─────────────
    for (let si = 0; si < subjects.length; si++) {
      const { name: subjName, startCol } = subjects[si];
      const endCol = si + 1 < subjects.length ? subjects[si + 1].startCol : colHdrRow.length;

      let scoreCol = -1, rankCol = -1, totalCol = -1;
      for (let c = startCol; c < endCol && c < colHdrRow.length; c++) {
        const hv = _ns(colHdrRow[c]);
        if (hv === '원점수') { scoreCol = c; continue; }
        if (hv.includes('석차') || hv.includes('동석차')) { rankCol = c; continue; }
        if (hv === '수강자수') { totalCol = c; continue; }
      }

      // 헤더에서 못 찾은 경우 데이터 패턴으로 추정
      if (rankCol < 0 || totalCol < 0) {
        for (let c = startCol; c < endCol && c < colHdrRow.length; c++) {
          const sampleVals = dataRowIndices.slice(0, 5).map(ri => _s((rows[ri]||[])[c]));
          const isRankLike = sampleVals.filter(v => /^\d+(\(\d+\))?$/.test(v) && parseInt(v) <= 500).length >= 3;
          if (isRankLike && c !== scoreCol && rankCol < 0) { rankCol = c; continue; }
          const nums = sampleVals.map(v => parseFloat(v)).filter(v => !isNaN(v) && v >= 10 && v <= 2000 && Number.isInteger(v));
          const allSame = nums.length >= 2 && nums.every(v => v === nums[0]);
          if (allSame && totalCol < 0) { totalCol = c; }
        }
      }
      if (scoreCol < 0 && rankCol > 0) {
        for (let c = rankCol - 1; c >= startCol; c--) {
          const sampleVals = dataRowIndices.slice(0, 5).map(ri => parseFloat(_s((rows[ri]||[])[c])));
          if (sampleVals.filter(v => !isNaN(v) && v >= 0 && v <= 100).length >= 3) { scoreCol = c; break; }
        }
      }

      if (rankCol < 0) continue; // 유효한 석차 열 없으면 스킵

      // ── 데이터 행 파싱 ──────────────────────────────────────────────
      for (const ri of dataRowIndices) {
        const row = rows[ri] || [];
        const name = _s(row[1]);
        if (!isValidStudentName(name)) continue;

        const rankRaw  = _s(row[rankCol]);
        const parsed = parseRankStr(rankRaw);
        if (!parsed) continue; // 미수강(공란) → 자동 스킵

        const scoreRaw = scoreCol >= 0 ? _s(row[scoreCol]) : '';
        const totalRaw = totalCol >= 0 ? _s(row[totalCol]) : '';
        const score  = scoreRaw !== '' ? parseFloat(scoreRaw) : null;
        let total  = totalRaw !== '' ? parseInt(totalRaw) : null;
        if (!total && parsed.total) total = parsed.total;

        const key = `${subjName}__${defaultTerm}`;
        if (!students[name]) students[name] = {};
        const existing = students[name][key];
        if (!existing) {
          students[name][key] = {
            subject: subjName, term: defaultTerm,
            score:  !isNaN(score) ? score : null,
            rank:   parsed.rank, tieCount: parsed.tieCount,
            total:  total && !isNaN(total) && total > 0 ? total : null,
          };
        } else {
          if (existing.rank === null) { existing.rank = parsed.rank; existing.tieCount = parsed.tieCount; }
          if (!existing.total && total) existing.total = total;
          if (existing.score === null && !isNaN(score)) existing.score = score;
        }
      }
    }
  }

  // ── 3단계: 가상등급 계산 → result 포맷 변환 ──────────────────────
  const result = {};
  for (const [name, subjs] of Object.entries(students)) {
    result[name] = {};
    for (const [key, d] of Object.entries(subjs)) {
      if (!d.rank || !d.total) continue;
      const vGrade = calcVirtualGrade(d.rank, d.tieCount || 1, d.total, fileGradeSystem);
      if (!vGrade) continue;
      result[name][key] = {
        subject: d.subject, term: d.term,
        grade: vGrade, score: d.score,
        rank: d.rank, tieCount: d.tieCount || 1, total: d.total,
        avg: null, stddev: null, distArr: null,
        isIlam: true, gradeSystem: fileGradeSystem,
        unit: nsIlamUnits[d.subject] || undefined, // NS
      };
    }
  }

  ilamData = students;
  const subjList = [...new Set(Object.values(result).flatMap(s => Object.values(s).map(d => d.subject)))];
  console.log(`[일람표 파서 v3] ${Object.keys(result).length}명 / 과목: ${subjList.join(', ')}`);
  return result;
}

// 한 등급 올리기 위해 추월해야 할 학생 수 계산
// 예: 39(3) → 39~41등 점유. 커트라인이 30위면, 순수하게 앞에 있는 사람 = 38 - 30 = 8명 추월 필요
// (내 앞 사람 수 38명 중 커트라인 이내 30명을 제외한 8명)
function calcPeopleAhead(subjectKey, studentName) {
  if (!ilamData) return null;
  const myData = ilamData[studentName]?.[subjectKey];
  if (!myData || myData.rank === null) return null;

  const myRank = myData.rank;
  const tieCount = myData.tieCount || 1;
  const total = myData.total;
  if (!total || total < 1) return null;

  // result 데이터에서 gradeSystem 읽기 (5 또는 9)
  const gs = allStudents[studentName]?.[subjectKey]?.gradeSystem || 5;

  const vGrade = calcVirtualGrade(myRank, tieCount, total, gs);
  if (!vGrade || vGrade <= 1) return null;

  // 한 등급 위의 커트라인
  const cuts = getGradeCuts(gs);
  const upperCutPct = cuts[vGrade - 2];
  // NS — 커트 석차는 내림: 259명의 10%는 25.9위 → 25위까지가 위 등급. 반올림(26위)하면 26위 학생이 「앞 0명」으로 나왔다.
  const cutRank = Math.floor(upperCutPct * total + 1e-9);
  if (cutRank < 1) return null;
  const lastRank = myRank + tieCount - 1;
  // 동점자까지 모두 제쳐야 혼자 커트 안에 든다
  const peopleAhead = Math.max(0, lastRank - cutRank);

  return { myRank, tieCount, lastRank, total, vGrade, cutRank, peopleAhead, gradeSystem: gs, estimated: false };
}

// "앞에 몇 명" 통합 계산
// - 전과목 일람표(실제 석차 보유) → calcPeopleAhead 정확값
// - 교과학습발달상황(석차 없음, 수강자수 보유) → 백분위 추정 기반 근사값 (estimated:true)
function getPeopleAhead(subjectKey, studentName) {
  const exact = calcPeopleAhead(subjectKey, studentName);
  if (exact) return exact;

  const d = allStudents[studentName]?.[subjectKey];
  if (!d || d.isMid || !d.total || d.total < 2 || d.grade == null || d.grade <= 1) return null;

  const c = clampedEntryPct(d, subjectKey, studentName);
  if (!c) return null;

  const cuts = getGradeCuts(c.gs);
  const g = Math.min(Math.max(Math.round(d.grade), 2), cuts.length + 1);
  // 한 등급 위의 커트라인 석차 (기록된 석차등급 기준)
  const cutRank = Math.floor(cuts[g - 2] * d.total + 1e-9); // NS — 내림 (25.9위 → 25위까지가 위 등급)
  if (cutRank < 1) return null;
  // 추정 석차: 백분위 × 수강자수, 등급 구간과 모순되지 않게 커트라인+1 이상으로 보정
  const estRank = Math.min(d.total, Math.max(cutRank + 1, Math.round(c.pct * d.total)));
  const peopleAhead = estRank - cutRank;

  return { myRank: estRank, tieCount: 1, lastRank: estRank, total: d.total, vGrade: g, cutRank, peopleAhead, gradeSystem: c.gs, estimated: true };
}

function onDragOver(e) { e.preventDefault(); document.getElementById('upload-zone').classList.add('drag'); }
function onDragLeave(e) { document.getElementById('upload-zone').classList.remove('drag'); }
function onDrop(e) { e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }
function onFileChange(e) { const f = e.target.files[0]; if (f) parseFile(f); }

function parseFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      lastFileName = file.name;
      lastSheetRows = {};
      wb.SheetNames.forEach(n => {
        lastSheetRows[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
      });

      // ── 스마트 자동 감지 (고등학교 전과목 성적 일람표 vs 나이스 교과학습발달상황) ──
      let bestIlam = {}, bestIlamN = 0;
      let bestNeis = {}, bestNeisN = 0, bestNeisS = 0;

      for (const sn of wb.SheetNames) {
        const rows = lastSheetRows[sn] || [];
        // 성적 일람표 시도
        try {
          const resIlam = parseIlamFile(rows);
          const nIlam = Object.keys(resIlam).length;
          if (nIlam > bestIlamN) { bestIlam = resIlam; bestIlamN = nIlam; }
        } catch (errIlam) {}

        // NEIS 교과학습발달상황 시도
        try {
          const resNeis = parseNEIS(rows, null);
          const nNeis = Object.keys(resNeis).length;
          const sNeis = Object.values(resNeis).reduce((a, stu) => a + Object.keys(stu).length, 0);
          if (nNeis > bestNeisN || (nNeis === bestNeisN && sNeis > bestNeisS)) {
            bestNeis = resNeis; bestNeisN = nNeis; bestNeisS = sNeis;
          }
        } catch (errNeis) {}
      }

      // 1) 현재 칩이 일람표이고 일람표 파싱에 성공한 경우
      if (currentFileType === 'ilam' && bestIlamN > 0) {
        gradeSystemMax = 5;
        applyParseResult(bestIlam, true);
        showToast(`전과목 성적 일람표(${bestIlamN}명) 로드 완료`);
        return;
      }

      // 2) 현재 칩이 NEIS이고 NEIS 파싱에 성공한 경우
      if (currentFileType === 'neis' && bestNeisN > 0 && bestNeisS > 0) {
        gradeSystemMax = 5;
        applyParseResult(bestNeis, false);
        showToast(`교과학습발달상황(${bestNeisN}명) 로드 완료`);
        return;
      }

      // 3) 교차 감지: 칩 선택과 상관없이 인식된 쪽으로 자동 전환
      if (bestIlamN > 0 && (bestNeisN === 0 || bestIlamN >= bestNeisN)) {
        selectFileType('ilam');
        gradeSystemMax = 5;
        applyParseResult(bestIlam, true);
        showToast(`전과목 성적 일람표(${bestIlamN}명)로 자동 인식되었습니다.`);
        return;
      }

      if (bestNeisN > 0 && bestNeisS > 0) {
        selectFileType('neis');
        gradeSystemMax = 5;
        applyParseResult(bestNeis, false);
        showToast(`교과학습발달상황(${bestNeisN}명)으로 자동 인식되었습니다.`);
        return;
      }

      // 4) 둘 다 자동 인식 실패 시 컬럼 매퍼 열기 (고등학교 안내 문구)
      console.warn('[성적파서] 고교 성적 자동 감지 실패 — 컬럼 매핑 UI 표시');
      showColumnMapper();
    } catch(err) {
      showToast('파일 파싱 실패: ' + err.message);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

let termGradeSystemMap = {};
function buildTermGradeSystemMap() {
  termGradeSystemMap = {};
  if (customGradeSystemMode === 'force5') {
    for (const stu of Object.values(allStudents || {})) {
      for (const d of Object.values(stu || {})) {
        if (d && d.term) termGradeSystemMap[d.term] = 5;
      }
    }
    return;
  }
  if (customGradeSystemMode === 'force9') {
    for (const stu of Object.values(allStudents || {})) {
      for (const d of Object.values(stu || {})) {
        if (d && d.term) termGradeSystemMap[d.term] = 9;
      }
    }
    return;
  }

  termGradeSystemMap = {};
  const stat = {};
  for (const stu of Object.values(allStudents)) {
    for (const d of Object.values(stu)) {
      if (d.isMid || !d.term) continue;
      const s = stat[d.term] || (stat[d.term] = { maxGrade: 0, hasDist: false, hasStd: false });
      if (d.grade > s.maxGrade) s.maxGrade = d.grade;
      if (d.distArr) s.hasDist = true;
      if (d.stddev != null) s.hasStd = true;
    }
  }
  for (const [term, s] of Object.entries(stat)) {
    if (s.maxGrade > 5) termGradeSystemMap[term] = 9;
    else if (s.hasDist) termGradeSystemMap[term] = 5;
    else if (s.hasStd) termGradeSystemMap[term] = 9;
  }
}

function applyParseResult(students, isIlam) {
  students = nsMergeNaesin(students, isIlam, false);
  allStudents = students;
  nsTakeAchOnly(students);
  buildTermGradeSystemMap();
  gradeSystemMax = 5; // 고교 2028 개편 5등급제 고정

  const names = Object.keys(allStudents);
  const uz = document.getElementById('upload-zone');
  uz.classList.add('upload-done');
  document.getElementById('upload-icon').innerHTML = ic('check', 26); // MOCK
  document.getElementById('upload-title').textContent = lastFileName;
  document.getElementById('upload-hint').textContent = `${names.length}명 파싱 완료`;
  document.getElementById('file-info').style.display = 'block';
  document.getElementById('file-info').textContent = `${names.length}명 학생 데이터 로드 완료`;

  const sel = document.getElementById('stu-sel');
  sel.innerHTML = '<option value="">-- 학생 선택 --</option>';
  names.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
  document.getElementById('s1').classList.remove('collapsed');
  document.getElementById('batch-count').textContent = names.length + '명';
  nsAfterMerge(); stuNoCapture(); mkStoreTouch(); uiRefresh(); // MOCK · NS
  nsMergeToast(names.length);
}

// ═══════════════════════════════════════════════
// 가상 데이터 사전 테스트 로더 (모바일/PC 원클릭)
// ═══════════════════════════════════════════════
async function loadVirtualSample(type) {
  try {
    const filename = (type === 'ilam') ? '전과목 성적 일람표(가상).xlsx' : '교과학습발달상황(가상).xlsx';
    showToast(filename + ' 불러오는 중...');
    const resp = await fetch(encodeURI(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const buf = await resp.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    lastFileName = filename;
    lastSheetRows = {};
    wb.SheetNames.forEach(n => { lastSheetRows[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:'' }); });

    if (type === 'ilam') {
      selectFileType('ilam');
      let best = {}, bestN = 0;
      for (const sn of wb.SheetNames) {
        const res = parseIlamFile(lastSheetRows[sn]);
        const n = Object.keys(res).length;
        if (n > bestN) { best = res; bestN = n; }
      }
      if (bestN > 0) {
        gradeSystemMax = 5;
        applyParseResult(best, true);
        autoPickFirstStudent();
        showToast('성적 일람표(' + bestN + '명) 가상 데이터 로드 완료!');
        return;
      }
    } else {
      selectFileType('neis');
      let best = {}, bestN = 0, bestS = 0;
      for (const sn of wb.SheetNames) {
        const res = parseNEIS(lastSheetRows[sn], null);
        const n = Object.keys(res).length;
        const s = Object.values(res).reduce((a,stu) => a + Object.keys(stu).length, 0);
        if (n > bestN || (n === bestN && s > bestS)) { best = res; bestN = n; bestS = s; }
      }
      if (bestN > 0 && bestS > 0) {
        applyParseResult(best);
        autoPickFirstStudent();
        showToast('교과학습발달상황(' + bestN + '명) 가상 데이터 로드 완료!');
        return;
      }
    }
    showToast('가상 파일 파싱 실패 — 형식을 확인해주세요.');
  } catch(err) {
    console.error('[loadVirtualSample error]', err);
    showToast('가상 데이터 로드 오류: ' + err.message);
  }
}

function autoPickFirstStudent() {
  const sel = document.getElementById('stu-sel');
  if (sel && sel.options.length > 1) {
    sel.selectedIndex = 1;
    onStudentChange();
    if (typeof checkAll === 'function') checkAll(true);
    generateAll();
    if (window.innerWidth <= 860 && typeof switchMob === 'function') {
      switchMob('right');
    }
  }
}

// ═══════════════════════════════════════════════
// 고교 5등급제 기본 테스트 데이터 (즉시 테스트 지원)
// ═══════════════════════════════════════════════
function initBuiltinTestData() {
  const S = {
    "홍길동": {
      "공통국어1__1학년 1학기": { subject:"공통국어1", term:"1학년 1학기", unit:4, score:96, avg:71.2, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:3, tieCount:1, gradeSystem:5, area:"국어", achieve:"A" },
      "공통수학1__1학년 1학기": { subject:"공통수학1", term:"1학년 1학기", unit:4, score:94, avg:64.5, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:5, tieCount:1, gradeSystem:5, area:"수학", achieve:"A" },
      "공통영어1__1학년 1학기": { subject:"공통영어1", term:"1학년 1학기", unit:4, score:89, avg:68.3, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:24, tieCount:2, gradeSystem:5, area:"영어", achieve:"B" },
      "한국사1__1학년 1학기":   { subject:"한국사1",   term:"1학년 1학기", unit:3, score:98, avg:73.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:2, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합사회1__1학년 1학기": { subject:"통합사회1", term:"1학년 1학기", unit:3, score:86, avg:69.4, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:26, tieCount:3, gradeSystem:5, area:"사회", achieve:"B" },
      "통합과학1__1학년 1학기": { subject:"통합과학1", term:"1학년 1학기", unit:3, score:92, avg:65.8, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:8, tieCount:1, gradeSystem:5, area:"과학", achieve:"A" },
      "공통국어2__1학년 2학기": { subject:"공통국어2", term:"1학년 2학기", unit:4, score:98, avg:72.5, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:2, tieCount:1, gradeSystem:5, area:"국어", achieve:"A" },
      "공통수학2__1학년 2학기": { subject:"공통수학2", term:"1학년 2학기", unit:4, score:95, avg:63.1, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:4, tieCount:1, gradeSystem:5, area:"수학", achieve:"A" },
      "공통영어2__1학년 2학기": { subject:"공통영어2", term:"1학년 2학기", unit:4, score:93, avg:67.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:10, tieCount:1, gradeSystem:5, area:"영어", achieve:"A" },
      "한국사2__1학년 2학기":   { subject:"한국사2",   term:"1학년 2학기", unit:3, score:96, avg:70.4, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:3, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합사회2__1학년 2학기": { subject:"통합사회2", term:"1학년 2학기", unit:3, score:91, avg:66.2, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:12, tieCount:2, gradeSystem:5, area:"사회", achieve:"A" },
      "통합과학2__1학년 2학기": { subject:"통합과학2", term:"1학년 2학기", unit:3, score:94, avg:64.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:6, tieCount:1, gradeSystem:5, area:"과학", achieve:"A" }
    },
    "김민수": {
      "공통국어1__1학년 1학기": { subject:"공통국어1", term:"1학년 1학기", unit:4, score:86, avg:71.2, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:28, tieCount:2, gradeSystem:5, area:"국어", achieve:"B" },
      "공통수학1__1학년 1학기": { subject:"공통수학1", term:"1학년 1학기", unit:4, score:92, avg:64.5, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:9, tieCount:1, gradeSystem:5, area:"수학", achieve:"A" },
      "공통영어1__1학년 1학기": { subject:"공통영어1", term:"1학년 1학기", unit:4, score:81, avg:68.3, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:45, tieCount:3, gradeSystem:5, area:"영어", achieve:"B" },
      "한국사1__1학년 1학기":   { subject:"한국사1",   term:"1학년 1학기", unit:3, score:85, avg:73.0, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:38, tieCount:1, gradeSystem:5, area:"사회", achieve:"B" },
      "통합사회1__1학년 1학기": { subject:"통합사회1", term:"1학년 1학기", unit:3, score:83, avg:69.4, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:35, tieCount:2, gradeSystem:5, area:"사회", achieve:"B" },
      "통합과학1__1학년 1학기": { subject:"통합과학1", term:"1학년 1학기", unit:3, score:89, avg:65.8, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:22, tieCount:1, gradeSystem:5, area:"과학", achieve:"B" },
      "공통국어2__1학년 2학기": { subject:"공통국어2", term:"1학년 2학기", unit:4, score:88, avg:72.5, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:25, tieCount:1, gradeSystem:5, area:"국어", achieve:"B" },
      "공통수학2__1학년 2학기": { subject:"공통수학2", term:"1학년 2학기", unit:4, score:96, avg:63.1, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:3, tieCount:1, gradeSystem:5, area:"수학", achieve:"A" },
      "공통영어2__1학년 2학기": { subject:"공통영어2", term:"1학년 2학기", unit:4, score:84, avg:67.0, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:34, tieCount:2, gradeSystem:5, area:"영어", achieve:"B" },
      "한국사2__1학년 2학기":   { subject:"한국사2",   term:"1학년 2학기", unit:3, score:87, avg:70.4, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:30, tieCount:1, gradeSystem:5, area:"사회", achieve:"B" },
      "통합사회2__1학년 2학기": { subject:"통합사회2", term:"1학년 2학기", unit:3, score:85, avg:66.2, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:29, tieCount:2, gradeSystem:5, area:"사회", achieve:"B" },
      "통합과학2__1학년 2학기": { subject:"통합과학2", term:"1학년 2학기", unit:3, score:91, avg:64.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:15, tieCount:1, gradeSystem:5, area:"과학", achieve:"A" }
    },
    "이영희": {
      "공통국어1__1학년 1학기": { subject:"공통국어1", term:"1학년 1학기", unit:4, score:94, avg:71.2, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:7, tieCount:1, gradeSystem:5, area:"국어", achieve:"A" },
      "공통수학1__1학년 1학기": { subject:"공통수학1", term:"1학년 1학기", unit:4, score:81, avg:64.5, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:36, tieCount:2, gradeSystem:5, area:"수학", achieve:"B" },
      "공통영어1__1학년 1학기": { subject:"공통영어1", term:"1학년 1학기", unit:4, score:95, avg:68.3, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:4, tieCount:1, gradeSystem:5, area:"영어", achieve:"A" },
      "한국사1__1학년 1학기":   { subject:"한국사1",   term:"1학년 1학기", unit:3, score:92, avg:73.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:11, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합사회1__1학년 1학기": { subject:"통합사회1", term:"1학년 1학기", unit:3, score:93, avg:69.4, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:8, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합과학1__1학년 1학기": { subject:"통합과학1", term:"1학년 1학기", unit:3, score:78, avg:65.8, stddev:null, distArr:[10,24,32,24,10], grade:3, total:210, rank:78, tieCount:3, gradeSystem:5, area:"과학", achieve:"C" },
      "공통국어2__1학년 2학기": { subject:"공통국어2", term:"1학년 2학기", unit:4, score:96, avg:72.5, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:5, tieCount:1, gradeSystem:5, area:"국어", achieve:"A" },
      "공통수학2__1학년 2학기": { subject:"공통수학2", term:"1학년 2학기", unit:4, score:85, avg:63.1, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:32, tieCount:1, gradeSystem:5, area:"수학", achieve:"B" },
      "공통영어2__1학년 2학기": { subject:"공통영어2", term:"1학년 2학기", unit:4, score:97, avg:67.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:2, tieCount:1, gradeSystem:5, area:"영어", achieve:"A" },
      "한국사2__1학년 2학기":   { subject:"한국사2",   term:"1학년 2학기", unit:3, score:94, avg:70.4, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:8, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합사회2__1학년 2학기": { subject:"통합사회2", term:"1학년 2학기", unit:3, score:95, avg:66.2, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:5, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합과학2__1학년 2학기": { subject:"통합과학2", term:"1학년 2학기", unit:3, score:82, avg:64.0, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:42, tieCount:2, gradeSystem:5, area:"과학", achieve:"B" }
    },
    "박지훈": {
      "공통국어1__1학년 1학기": { subject:"공통국어1", term:"1학년 1학기", unit:4, score:76, avg:71.2, stddev:null, distArr:[10,24,32,24,10], grade:3, total:210, rank:85, tieCount:3, gradeSystem:5, area:"국어", achieve:"C" },
      "공통수학1__1학년 1학기": { subject:"공통수학1", term:"1학년 1학기", unit:4, score:98, avg:64.5, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:1, tieCount:1, gradeSystem:5, area:"수학", achieve:"A" },
      "공통영어1__1학년 1학기": { subject:"공통영어1", term:"1학년 1학기", unit:4, score:75, avg:68.3, stddev:null, distArr:[10,24,32,24,10], grade:3, total:210, rank:90, tieCount:4, gradeSystem:5, area:"영어", achieve:"C" },
      "한국사1__1학년 1학기":   { subject:"한국사1",   term:"1학년 1학기", unit:3, score:82, avg:73.0, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:50, tieCount:2, gradeSystem:5, area:"사회", achieve:"B" },
      "통합사회1__1학년 1학기": { subject:"통합사회1", term:"1학년 1학기", unit:3, score:80, avg:69.4, stddev:null, distArr:[10,24,32,24,10], grade:3, total:210, rank:72, tieCount:1, gradeSystem:5, area:"사회", achieve:"C" },
      "통합과학1__1학년 1학기": { subject:"통합과학1", term:"1학년 1학기", unit:3, score:97, avg:65.8, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:2, tieCount:1, gradeSystem:5, area:"과학", achieve:"A" },
      "공통국어2__1학년 2학기": { subject:"공통국어2", term:"1학년 2학기", unit:4, score:80, avg:72.5, stddev:null, distArr:[10,24,32,24,10], grade:3, total:210, rank:75, tieCount:2, gradeSystem:5, area:"국어", achieve:"C" },
      "공통수학2__1학년 2학기": { subject:"공통수학2", term:"1학년 2학기", unit:4, score:99, avg:63.1, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:1, tieCount:1, gradeSystem:5, area:"수학", achieve:"A" },
      "공통영어2__1학년 2학기": { subject:"공통영어2", term:"1학년 2학기", unit:4, score:78, avg:67.0, stddev:null, distArr:[10,24,32,24,10], grade:3, total:210, rank:82, tieCount:1, gradeSystem:5, area:"영어", achieve:"C" },
      "한국사2__1학년 2학기":   { subject:"한국사2",   term:"1학년 2학기", unit:3, score:84, avg:70.4, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:48, tieCount:2, gradeSystem:5, area:"사회", achieve:"B" },
      "통합사회2__1학년 2학기": { subject:"통합사회2", term:"1학년 2학기", unit:3, score:82, avg:66.2, stddev:null, distArr:[10,24,32,24,10], grade:3, total:210, rank:68, tieCount:1, gradeSystem:5, area:"사회", achieve:"C" },
      "통합과학2__1학년 2학기": { subject:"통합과학2", term:"1학년 2학기", unit:3, score:99, avg:64.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:1, tieCount:1, gradeSystem:5, area:"과학", achieve:"A" }
    },
    "최수아": {
      "공통국어1__1학년 1학기": { subject:"공통국어1", term:"1학년 1학기", unit:4, score:97, avg:71.2, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:1, tieCount:1, gradeSystem:5, area:"국어", achieve:"A" },
      "공통수학1__1학년 1학기": { subject:"공통수학1", term:"1학년 1학기", unit:4, score:79, avg:64.5, stddev:null, distArr:[10,24,32,24,10], grade:3, total:210, rank:74, tieCount:2, gradeSystem:5, area:"수학", achieve:"C" },
      "공통영어1__1학년 1학기": { subject:"공통영어1", term:"1학년 1학기", unit:4, score:96, avg:68.3, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:3, tieCount:1, gradeSystem:5, area:"영어", achieve:"A" },
      "한국사1__1학년 1학기":   { subject:"한국사1",   term:"1학년 1학기", unit:3, score:94, avg:73.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:7, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합사회1__1학년 1학기": { subject:"통합사회1", term:"1학년 1학기", unit:3, score:92, avg:69.4, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:10, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합과학1__1학년 1학기": { subject:"통합과학1", term:"1학년 1학기", unit:3, score:83, avg:65.8, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:40, tieCount:2, gradeSystem:5, area:"과학", achieve:"B" },
      "공통국어2__1학년 2학기": { subject:"공통국어2", term:"1학년 2학기", unit:4, score:99, avg:72.5, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:1, tieCount:1, gradeSystem:5, area:"국어", achieve:"A" },
      "공통수학2__1학년 2학기": { subject:"공통수학2", term:"1학년 2학기", unit:4, score:81, avg:63.1, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:48, tieCount:2, gradeSystem:5, area:"수학", achieve:"B" },
      "공통영어2__1학년 2학기": { subject:"공통영어2", term:"1학년 2학기", unit:4, score:98, avg:67.0, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:1, tieCount:1, gradeSystem:5, area:"영어", achieve:"A" },
      "한국사2__1학년 2학기":   { subject:"한국사2",   term:"1학년 2학기", unit:3, score:97, avg:70.4, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:2, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합사회2__1학년 2학기": { subject:"통합사회2", term:"1학년 2학기", unit:3, score:96, avg:66.2, stddev:null, distArr:[10,24,32,24,10], grade:1, total:210, rank:4, tieCount:1, gradeSystem:5, area:"사회", achieve:"A" },
      "통합과학2__1학년 2학기": { subject:"통합과학2", term:"1학년 2학기", unit:3, score:85, avg:64.0, stddev:null, distArr:[10,24,32,24,10], grade:2, total:210, rank:35, tieCount:1, gradeSystem:5, area:"과학", achieve:"B" }
    }
  };
  lastFileName = "2028_개편_고교가상성적(5명).xlsx";
  gradeSystemMax = 5;
  applyParseResult(S, false);
  autoPickFirstStudent();
}

// ═══════════════════════════════════════════════
// NEIS PARSER (유연한 헤더 감지 + 수동 매핑 지원)
// ═══════════════════════════════════════════════
function parseNEIS(rows, manualCOL) {
  const students = {};
  let curName = null, curGY = null, curTm = null;

  let COL = manualCOL || autoDetectColumns(rows);
  if (!COL) { console.warn('[성적파서] 헤더 감지 실패'); return students; }
  console.log('[성적파서] 컬럼 매핑:', JSON.stringify(COL));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; if (!row) continue;

    // 헤더행·합계행 스킵
    const c0 = COL.num>=0 ? _norm(row[COL.num]) : '';
    const c1 = COL.name>=0 ? _norm(row[COL.name]) : '';
    const isHeader = Object.values(HEADER_ALIASES).some(arr => arr.some(a => c0===a.toLowerCase()||c1===a.toLowerCase()));
    if (isHeader) continue;
    if (c0.includes('이수학점')||c1.includes('이수학점')) continue;

    const nameCell = COL.name>=0 ? String(row[COL.name]||'').trim() : '';
    const numRaw   = COL.num>=0 ? row[COL.num] : null;

    // 학생 감지
    if (isValidStudentName(nameCell)) {
      if (COL.num >= 0 && numRaw !== '' && numRaw !== null && !isNaN(parseFloat(numRaw))) {
        curName = nameCell; if (!students[curName]) students[curName] = {};
      } else if (nameCell !== curName) {
        curName = nameCell; if (!students[curName]) students[curName] = {};
      }
    }
    if (!curName) continue;

    // 학년·학기
    if (COL.grade>=0) { const v=row[COL.grade]; if (v!==''&&v!==null&&!isNaN(parseFloat(v))) curGY=parseInt(v); }
    if (COL.term>=0)  { const v=row[COL.term];  if (v!==''&&v!==null&&!isNaN(parseFloat(v))) curTm=parseInt(v); }

    const subj = COL.subj>=0 ? String(row[COL.subj]||'').trim() : '';
    if (!subj) continue;

    // 등급: 석차등급 우선 → 성취도(A~E) 대체
    let gradeNum = null;
    if (COL.rank>=0) { const v=row[COL.rank]; if (v!==''&&v!==null&&!isNaN(parseFloat(v))) gradeNum=parseFloat(v); }
    if (gradeNum===null && COL.achieve>=0) {
      const ch = String(row[COL.achieve]||'').trim().charAt(0).toUpperCase();
      const map = {A:1,B:2,C:3,D:4,E:5};
      if (map[ch]!==undefined) gradeNum = map[ch];
    }
    if (gradeNum===null||gradeNum<1||gradeNum>9) continue;
    if (!curGY||!curTm) continue;

    // 원점수
    let score=null, avg=null, stddev=null;
    if (COL.score>=0) {
      const sr = String(row[COL.score]||'').trim();
      if (sr.includes('/')) {
        const p=sr.split('/'); score=parseFloat(p[0]);
        const m=(p[1]||'').match(/^([\d.]+)\(([\d.]+)\)/);
        if (m) { avg=parseFloat(m[1]); stddev=parseFloat(m[2]); } else { avg=parseFloat(p[1]); }
      }
    }
    // 분포비율
    let distArr=null;
    if (COL.dist>=0) {
      const dr=String(row[COL.dist]||'').trim();
      const dm=[...dr.matchAll(/[A-E]\(([\d.]+)\)/g)];
      if (dm.length>=2) distArr=dm.map(m=>parseFloat(m[1]));
    }
    // 성취도 문자 (5등급제 백분위 추정에 사용)
    let achLetter=null;
    if (COL.achieve>=0) {
      const ch=String(row[COL.achieve]||'').trim().charAt(0).toUpperCase();
      if (ch && 'ABCDE'.includes(ch)) achLetter=ch;
    }
    // 수강자수 (신양식: 별도 컬럼 / 구양식: "성취도(수강자수)" 컬럼의 "B(270)" 형태)
    let total=null;
    if (COL.total>=0) {
      const tv=String(row[COL.total]||'').trim();
      const tm=tv.match(/\((\d+)\)/);
      if (tm) total=parseInt(tm[1]);
      else if (tv!=='' && !isNaN(parseFloat(tv))) total=Math.round(parseFloat(tv));
      // 구양식 "B(270)" 형태면 성취도 문자도 함께 추출
      if (achLetter===null && tm) { const ch=tv.charAt(0).toUpperCase(); if ('ABCDE'.includes(ch)) achLetter=ch; }
    }
    if (total===null && COL.achieve>=0) {
      const am=String(row[COL.achieve]||'').match(/\((\d+)\)/);
      if (am) total=parseInt(am[1]);
    }

    const tl = `${curGY}학년 ${curTm}학기`;
    const key = `${subj}__${tl}`;
    // NS — 학점·교과를 붙이고, 석차등급 없이 성취도만 있는 과목(진로선택·체육·예술)은
    //      A→1등급으로 섞이지 않게 따로 둔다. 대학 산출에서도 석차등급 평균에 넣지 않는다.
    const nsEntry = { subject:subj, term:tl, grade:gradeNum, score, avg, stddev, distArr, achieve:achLetter, total };
    if (COL.unit>=0) { const u = parseFloat(row[COL.unit]); if (u > 0) nsEntry.unit = u; }
    if (COL.area>=0) { const a = String(row[COL.area]||'').trim(); if (a) nsEntry.area = a; }
    const nsRk = COL.rank>=0 ? row[COL.rank] : null;
    if (COL.rank>=0 && currentSchoolLevel === 'high' && (nsRk===''||nsRk===null||isNaN(parseFloat(nsRk)))) {
      if (!students.__achOnly) Object.defineProperty(students, '__achOnly', { value: {}, enumerable: false });
      (students.__achOnly[curName] || (students.__achOnly[curName] = [])).push(nsEntry);
      continue;
    }
    if (!students[curName][key]) students[curName][key] = nsEntry;
  }
  return students;
}

// ═══════════════════════════════════════════════
// COLUMN MAPPER UI (방안 B)
// ═══════════════════════════════════════════════
function showColumnMapper() {
  const sheetNames = Object.keys(lastSheetRows);
  if (!sheetNames.length) { showToast('시트 데이터 없음'); return; }
  const sel = document.getElementById('mapper-sheet-sel');
  sel.innerHTML = sheetNames.map(n => `<option value="${n}">${n}</option>`).join('');
  renderMapperTable(sheetNames[0]);
  document.getElementById('mapper-bg').classList.add('open');
}
function closeMapper() { document.getElementById('mapper-bg').classList.remove('open'); }
function onMapperSheetChange() { renderMapperTable(document.getElementById('mapper-sheet-sel').value); }

function renderMapperTable(sheetName) {
  const rows = lastSheetRows[sheetName] || [];
  let startR = 0;
  for (let i=0; i<Math.min(20,rows.length); i++) { if ((rows[i]||[]).filter(v=>v!==''&&v!==null&&v!==undefined).length>=3) { startR=i; break; } }
  const hdr = rows[startR] || [];
  const preview = rows.slice(startR+1, startR+7);
  const maxC = Math.min(hdr.length||1, 25);

  const guesses = [];
  for (let c=0; c<maxC; c++) {
    let found = '';
    for (const k of Object.keys(HEADER_ALIASES)) { if (_matchAlias(hdr[c],k)) { found=k; break; } }
    guesses.push(found);
  }

  let html = '<table class="mapper-table"><thead><tr>';
  for (let c=0; c<maxC; c++) {
    html += '<th><select data-col="'+c+'">';
    for (const [val,label] of Object.entries(ROLE_LABELS)) {
      html += `<option value="${val}" ${val===guesses[c]?'selected':''}>${label}</option>`;
    }
    html += '</select></th>';
  }
  html += '</tr><tr>';
  for (let c=0; c<maxC; c++) html += `<td style="font-weight:700;color:var(--ink);background:var(--good-2)">${hdr[c]??''}</td>`;
  html += '</tr></thead><tbody>';
  preview.forEach(row => { html += '<tr>'; for (let c=0; c<maxC; c++) html += `<td>${row[c]??''}</td>`; html += '</tr>'; });
  html += '</tbody></table>';
  document.getElementById('mapper-table-wrap').innerHTML = html;
}

function applyManualMapping() {
  const sels = document.querySelectorAll('#mapper-table-wrap select[data-col]');
  const mapping = {};
  sels.forEach(s => { if (s.value && s.value!=='skip') mapping[s.value] = parseInt(s.dataset.col); });

  if (mapping.name===undefined || mapping.subj===undefined || (mapping.rank===undefined && mapping.achieve===undefined)) {
    showToast('최소 성명·과목·석차등급(또는 성취도)을 지정하세요'); return;
  }

  const COL = { num:mapping.num??-1, name:mapping.name, grade:mapping.gradeYr??-1, term:mapping.term??-1, subj:mapping.subj, score:mapping.score??-1, rank:mapping.rank??-1, dist:mapping.dist??-1, achieve:mapping.achieve??-1, total:mapping.total??-1, headerRow:-1 };

  const sheetName = document.getElementById('mapper-sheet-sel').value;
  const rows = lastSheetRows[sheetName] || [];
  const result = parseNEIS(rows, COL);
  const names = Object.keys(result);
  const subjCount = Object.values(result).reduce((a,s) => a+Object.keys(s).length, 0);

  if (!names.length || !subjCount) { showToast('매핑으로도 데이터를 파싱하지 못했습니다. 열 지정을 다시 확인해주세요.'); return; }
  closeMapper();
  applyParseResult(result);
}

// ═══════════════════════════════════════════════
// STUDENT SELECT
// ═══════════════════════════════════════════════
function onStudentChange() {
  const name = document.getElementById('stu-sel').value;
  if (!name) return;
  currentStudent = name;
  checkedSubjects.clear();
  currentChartCategory = null;
  currentNMGrade = '전체';

  const badge = document.getElementById('stu-badge');
  badge.style.display = 'inline-flex';
  document.getElementById('stu-badge-txt').textContent = name;

  // Build subject list
  const data = allStudents[name] || {}; // MOCK
  const grid = document.getElementById('subj-grid');
  grid.innerHTML = '';

  // Collect unique subjects with term order
  const subjMap = {}; // subject -> [terms]
  Object.values(data).forEach(d => {
    if (!subjMap[d.subject]) subjMap[d.subject] = [];
    if (!subjMap[d.subject].includes(d.term)) subjMap[d.subject].push(d.term);
  });

  Object.keys(subjMap).forEach(subj => {
    checkedSubjects.add(subj);
    const chip = document.createElement('div');
    chip.className = 'subj-chip checked';
    chip.dataset.subj = subj;
    chip.innerHTML = `<span class="ico" style="font-size:9px">✓</span> ${subj}`;
    chip.onclick = () => toggleSubj(chip, subj);
    grid.appendChild(chip);
  });

  document.getElementById('s2').classList.remove('collapsed');
  document.getElementById('s3').classList.remove('collapsed');
  document.getElementById('stu-info').style.display = 'block';
  document.getElementById('stu-info').textContent = `이수 과목 ${Object.keys(subjMap).length}개`;
}

function toggleSubj(chip, subj) {
  if (checkedSubjects.has(subj)) {
    checkedSubjects.delete(subj);
    chip.classList.remove('checked');
    chip.innerHTML = `${subj}`;
  } else {
    checkedSubjects.add(subj);
    chip.classList.add('checked');
    chip.innerHTML = `<span class="ico" style="font-size:9px">✓</span> ${subj}`;
  }
}

function checkAll(val) {
  document.querySelectorAll('.subj-chip').forEach(chip => {
    const subj = chip.dataset.subj;
    if (val) { checkedSubjects.add(subj); chip.classList.add('checked'); chip.innerHTML = `<span class="ico" style="font-size:9px">✓</span> ${subj}`; }
    else { checkedSubjects.delete(subj); chip.classList.remove('checked'); chip.innerHTML = subj; }
  });
}

// ═══════════════════════════════════════════════
// GENERATE ALL
// ═══════════════════════════════════════════════
function generateAll() {
  if (!currentStudent) { showToast('학생을 먼저 선택해 주세요.'); return; }
  const mkOnly = !checkedSubjects.size && mkHasData() && !!mockStudents[currentStudent]; // MOCK
  if (!checkedSubjects.size && !mkOnly) { showToast('과목을 하나 이상 선택해 주세요.'); return; }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('result-area').style.display = 'block';
  // 모바일 화면에서는 분석 버튼 클릭 시 결과 탭으로 즉시 자동 전환
  if (window.innerWidth <= 860) { switchMob('right'); }


  // 일람표 모드 카드 표시/숨기기
  const ilamCard = document.getElementById('ilam-analysis-card');
  const isIlamMode = currentFileType === 'ilam' || Object.values(allStudents[currentStudent] || {}).some(d => d.isIlam);
  ilamCard.style.display = isIlamMode ? 'block' : 'none';

  if (!mkOnly) { // MOCK
    buildSummary();
    buildTable();
    if (isIlamMode) buildIlamAnalysis();
    buildChart();
    buildRadarChart();
    buildCatBarChart();
    buildNearMiss();
  }
  buildPrompt();
  nsBuildAll(); // NS
  mkUpdateTabBadges(); // MOCK
  switchResultTab(mkOnly ? 'mock' : currentResultTab); // MOCK
  uiRefresh(); setRail(true); // MOCK

  mkStoreTouch(); // MOCK
  showToast('분석이 끝났습니다.');
  if (window.innerWidth <= 768) switchMob('right');
}

// ── 일람표 분석 카드 ──
function buildIlamAnalysis() {
  const data = allStudents[currentStudent];
  const wrap = document.getElementById('ilam-analysis-content');

  // 모든 과목 데이터 수집
  const items = Object.entries(data)
    .filter(([key, d]) => checkedSubjects.has(d.subject) && d.isIlam) // NS — 확정 성적은 빼고 일람표 과목만
    .map(([key, d]) => {
      const pa = calcPeopleAhead(key, currentStudent);
      return { key, ...d, peopleAhead: pa };
    })
    .sort((a, b) => a.grade - b.grade);

  // 이 학생의 파일 등급제 감지
  const gs = items[0]?.gradeSystem || 5;
  const gsMax = gs; // 5 또는 9

  // 등급 색상: 5등급 / 9등급 모두 대응
  const gradeColor = g => {
    if (gsMax === 5) return ['','#34C759','#f59e0b','#e06b8b','#c0392b','#7b241c'][g] || '#888';
    return ['','#34C759','#7cca8f','#b5e03a','#f5c842','#f59e0b','#f97316','#e06b8b','#c0392b','#7b241c'][g] || '#888';
  };
  const vgClass = g => {
    if (g === 1) return 'vg1';
    if (g === 2) return 'vg2';
    if (g <= 3) return 'vg3';
    if (g <= 4) return 'vg4';
    return 'vg5';
  };

  // 카드 상단 안내 문구 (등급제 표시)
  document.querySelector('#ilam-analysis-card .result-title + div').textContent =
    `원점수 석차 기반 1차 고사 원점수 석차로 낸 예상 등급(${gsMax}등급제) · 한 등급 올리기 위한 인원 표시`;

  // 전체 개요 테이블
  let html = '<div style="overflow-x:auto"><table class="overview-table"><thead><tr>';
  html += '<th>과목</th><th>원점수</th><th>석차</th><th>수강자</th><th>예상 등급</th><th>→ 목표등급</th><th>앞에 있는 학생</th>';
  html += '</tr></thead><tbody>';

  for (const it of items) {
    const pa = it.peopleAhead;
    const targetGrade = it.grade > 1 ? it.grade - 1 : null;
    const gc = gradeColor(it.grade);
    const rankDisplay = it.rank ? `${it.rank}위` : '-';
    const totalDisplay = it.total ? `${it.total}명` : '-';

    let aheadCell = '';
    if (it.grade === 1) {
      aheadCell = '<span style="font-size:10px;color:#34C759;font-weight:800">최고 등급</span>';
    } else if (pa) {
      const urgency = pa.peopleAhead <= 5 ? '#e06b8b' : pa.peopleAhead <= 15 ? '#f59e0b' : '#7aaa97';
      aheadCell = `<span style="font-size:11px;font-weight:800;color:${urgency}">앞으로 <b>${pa.peopleAhead}명</b></span><br><span style="font-size:9px;color:var(--ink-3)">${pa.myRank}위→${pa.cutRank}위 이내${pa.tieCount > 1 ? ' · 동석차 '+pa.tieCount+'명' : ''}</span>`;
    } else {
      aheadCell = '<span style="font-size:10px;color:var(--ink-3)">-</span>';
    }

    html += `<tr>
      <td><b>${it.subject}</b></td>
      <td>${it.score !== null ? it.score + '점' : '-'}</td>
      <td>${rankDisplay}</td>
      <td>${totalDisplay}</td>
      <td><span class="${vgClass(it.grade)}">${it.grade}등급</span></td>
      <td>${targetGrade ? `<span style="font-size:10px;font-weight:800;color:#8b5cf6">${targetGrade}등급 목표</span>` : '-'}</td>
      <td>${aheadCell}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';

  // 아쉬운 과목 우선순위
  const nearItems = items
    .filter(it => it.grade > 1 && it.peopleAhead !== null)
    .sort((a, b) => (a.peopleAhead?.peopleAhead ?? 9999) - (b.peopleAhead?.peopleAhead ?? 9999));

  if (nearItems.length > 0) {
    html += `<div style="margin-top:14px"><div style="font-size:11px;font-weight:900;color:#6d28d9;margin-bottom:8px">효율적 등급 상승 과목 우선순위</div>`;
    html += '<div style="font-size:10px;color:#7c3aed;margin-bottom:10px;padding:6px 10px;background:#ede9fe;border-radius:8px">위에 있는 학생 수가 적을수록 → 조금만 올려도 한 등급 UP! 집중 학습 추천 순서입니다.</div>';

    nearItems.forEach((it, idx) => {
      const pa = it.peopleAhead;
      const rank = idx + 1;
      const medal = rank === 1 ? '<b style="color:var(--accent)">1위</b>' : rank === 2 ? '<b style="color:var(--ink-2)">2위</b>' : rank === 3 ? '<b style="color:var(--ink-3)">3위</b>' : `<span style="font-size:11px;color:var(--ink-3)">${rank}위</span>`;
      const urgencyBg = pa.peopleAhead <= 5 ? '#fff0f3' : pa.peopleAhead <= 15 ? '#fffbeb' : '#f5f3ff';
      const urgencyBorder = pa.peopleAhead <= 5 ? '#fecdd3' : pa.peopleAhead <= 15 ? '#fde68a' : '#ddd6fe';
      const urgencyLabel = pa.peopleAhead <= 5 ? '매우 아쉬움!' : pa.peopleAhead <= 15 ? '⚡ 노력하면 가능!' : '꾸준히 노력 필요';

      html += `<div class="nm5-item ${rank===1?'rank1':''}" style="background:${urgencyBg};border-color:${urgencyBorder}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:7px">
            <span style="font-size:14px">${medal}</span>
            <span style="font-size:13px;font-weight:900;color:var(--ink)">${it.subject}</span>
            <span class="${vgClass(it.grade)}">${it.grade}등급</span>
            <span style="font-size:10px;font-weight:800;color:#8b5cf6">→ ${it.grade-1}등급</span>
          </div>
          <span style="font-size:10px;font-weight:800;color:#6d28d9">${urgencyLabel}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:11px">
          <span>현재 <b>${pa.myRank}위</b>${pa.tieCount > 1 ? `~${pa.lastRank}위 (동석차 ${pa.tieCount}명)` : ''} / ${pa.total}명</span>
          <span>목표 <b>${pa.cutRank}위</b> 이내</span>
          <span style="font-weight:900;color:#6d28d9">앞에 <b style="font-size:13px">${pa.peopleAhead}명</b> 추월 필요</span>
        </div>
        ${it.score !== null ? `<div style="font-size:10px;color:var(--ink-3);margin-top:3px">원점수 ${it.score}점</div>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  wrap.innerHTML = html;
}

// ── Summary ──
function buildSummary() {
  const data = allStudents[currentStudent] || {}; // MOCK
  const isMidMode = currentSchoolLevel === 'middle';
  const grades = Object.values(data).filter(d => checkedSubjects.has(d.subject)).map(d => d.grade);
  const nsA = nsAvgInfo(Object.values(data).filter(d => checkedSubjects.has(d.subject))); // NS — 학점 가중
  const avg = nsA.avg === null ? '-' : nsA.avg.toFixed(2);
  const best = grades.length ? Math.min(...grades) : '-';
  const worst = grades.length ? Math.max(...grades) : '-';
  const achMap = {1:'A',2:'B',3:'C',4:'D',5:'E'};
  const isEstimated = isMidMode && Object.values(data).some(d => d.isMidIlam);
  const estMark = isEstimated ? '<span style="font-size:9px;color:#b45309;font-weight:700"> (추정)</span>' : '';
  const avgLabel = isMidMode ? `${avg} (${achMap[Math.round(parseFloat(avg))]||''})` : avg;
  const bestLabel = isMidMode ? (achMap[best]||best) : best+'등급';
  const worstLabel = isMidMode ? (achMap[worst]||worst) : worst+'등급';

  document.getElementById('summary-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div style="background:var(--paper);border:1px solid var(--line-2);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:10px;font-weight:800;color:var(--ink-3)">선택 과목 수</div>
        <div style="font-size:22px;font-weight:900;color:var(--good)">${checkedSubjects.size}<span style="font-size:12px">개</span></div>
      </div>
      <div style="background:var(--paper);border:1px solid var(--line-2);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:10px;font-weight:800;color:var(--ink-3)">평균 ${isMidMode?'성취도':'등급'}${estMark}${nsA.weighted ? ' · 학점 가중' : ''}</div>
        <div style="font-size:${isMidMode?'16':'22'}px;font-weight:900;color:var(--warn)">${avgLabel}</div>
      </div>
      <div style="background:var(--paper);border:1px solid var(--line-2);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:10px;font-weight:800;color:var(--ink-3)">최고/최저</div>
        <div style="font-size:18px;font-weight:900;color:var(--ink)">${bestLabel}<span style="color:var(--ink-3);font-size:12px"> / </span>${worstLabel}</div>
      </div>
    </div>`;
  nsSummaryExtra(); // NS
}

// ── 5등급→9등급 환산 토글 ──
function toggle9Grade() { // MOCK — 왜 안 나오는지까지 알려준다
  if (!currentStudent) { showToast('학생을 먼저 선택한 뒤 [분석]을 눌러 주세요.'); return; }
  show9Grade = !show9Grade;
  const tg = document.getElementById('conv9-toggle');
  const tx = document.getElementById('conv9-toggle-txt');
  const nt = document.getElementById('conv9-note');
  tg.classList.toggle('active', show9Grade);
  tx.textContent = show9Grade ? '9등급 환산 끄기' : '9등급으로 환산';
  buildTable();

  if (!show9Grade) { nt.style.display = 'none'; return; }

  // 9등급제로 바꿀 것이 하나도 없으면 빈손으로 끝난다 — 이유를 적어 준다
  const wrap = document.getElementById('grade-table-wrap');
  const hit = wrap && wrap.innerHTML.indexOf('conv9-badge') >= 0;
  nt.style.display = 'block';
  if (hit) {
    nt.className = 'note info';
    nt.innerHTML = '각 등급 아래의 <b>≈9등급제</b> 값이 환산 결과입니다. 5등급제(고1·2) 성적을 9등급 커트라인에 대입한 <b>예상값</b>이라 인원 분포에 따라 실제와 다를 수 있습니다.';
  } else {
    nt.className = 'note warn';
    nt.innerHTML = '환산할 <b>5등급제 성적이 없습니다.</b>';
    showToast('환산할 5등급제 성적이 없습니다.');
  }
}

// 성적 항목의 등급제(5/9) 판별
// 우선순위: 파일에 기록된 gradeSystem → 학기별 감지 맵 → 데이터 형태(표준편차=9 / 분포비율=5) → 학년 추정
function entryGradeSystem(d) {
  if (d.gradeSystem) return d.gradeSystem;
  if (d.term && termGradeSystemMap[d.term]) return termGradeSystemMap[d.term];
  if (d.stddev != null) return 9;
  if (d.distArr) return 5;
  return (d.term && (d.term.startsWith('1학년') || d.term.startsWith('2학년'))) ? 5 : 9;
}

// 해당 성적 항목이 (고1·2 공통과목) 5등급제인지 판별
function isFiveGradeEntry(d) {
  if (currentSchoolLevel !== 'high' || d.isMid) return false;
  return entryGradeSystem(d) === 5;
}

// ═══════════════════════════════════════════════
// 소수점 등급 계산 (백분위 기반, 둘째자리까지)
// ═══════════════════════════════════════════════
// 표준정규분포 누적확률 근사 (Abramowitz & Stegun 7.1.26)
function erf(x) {
  const sign = x < 0 ? -1 : 1; x = Math.abs(x);
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign * y;
}
function normalCDF(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

// 원점수-평균 차이로 구간 내 위치 보정 (점수가 높을수록 상위 = 작은 값)
function scoreNudge(d) {
  if (d.score == null || d.avg == null) return 0.5;
  return Math.min(0.9, Math.max(0.1, 0.5 - (d.score - d.avg) / 100));
}

// 과목 백분위(상위 비율, 0에 가까울수록 1등) 추정. precise=true면 실측(석차/표준편차/분포) 기반
function calcPercentileInfo(d, subjectKey, studentName) {
  // 1) 석차/수강자수가 있으면(전과목 일람표) → 정확한 백분위 (1등급 포함 전체 등급)
  if (d.rank && d.total) {
    const midRank = d.rank + ((d.tieCount || 1) - 1) / 2; // 동석차 중간값
    return { pct: Math.min(0.999, Math.max(0.0005, midRank / d.total)), precise: true };
  }
  // 2) 9등급제 NEIS: 표준편차 기반 z-score → 정규분포 백분위
  if (d.stddev != null && d.stddev > 0 && d.score != null && d.avg != null) {
    const z = (d.score - d.avg) / d.stddev;
    return { pct: Math.min(0.999, Math.max(0.0005, 1 - normalCDF(z))), precise: true };
  }
  // 3) 5등급제 NEIS: 성취도별 분포비율(A~E) × 성취도/원점수 → 백분위 추정
  //    ※ distArr는 석차등급 분포가 아니라 "성취도(A~E)" 분포이므로,
  //      성취도 밴드 구간과 석차등급 구간의 교집합 안에서 위치를 추정한다.
  if (d.distArr && d.distArr.length >= 2 && d.grade >= 1) {
    const shares = d.distArr.map(v => v / 100);
    // 성취도 밴드 인덱스: 성취도 문자 우선, 없으면 원점수 고정컷(90/80/70/60)으로 추정
    let bandIdx = null;
    if (d.achieve) { const bi = { A:0, B:1, C:2, D:3, E:4 }[d.achieve]; if (bi != null && bi < shares.length) bandIdx = bi; }
    if (bandIdx === null && d.score != null) bandIdx = d.score >= 90 ? 0 : d.score >= 80 ? 1 : d.score >= 70 ? 2 : d.score >= 60 ? 3 : 4;
    if (bandIdx !== null && bandIdx < shares.length) {
      const aLo = shares.slice(0, bandIdx).reduce((a, b) => a + b, 0);
      const aHi = aLo + (shares[bandIdx] || 0);
      const b5 = [0, ...getGradeCuts(5), 1];
      const g = Math.min(Math.max(d.grade, 1), 5);
      const gLo = b5[g - 1], gHi = b5[g];
      // 성취도 밴드 ∩ 석차등급 구간 (데이터 불일치 시 석차등급 구간 사용)
      let lo = Math.max(aLo, gLo), hi = Math.min(aHi, gHi);
      if (lo >= hi) { lo = gLo; hi = gHi; }
      const pct = lo + scoreNudge(d) * (hi - lo);
      return { pct: Math.min(0.999, Math.max(0.0005, pct)), precise: true };
    }
  }
  // 4) 폴백: 석차등급 구간 안에서 원점수-평균 위치로 추정 (참고용)
  if (d.grade >= 1) {
    const gs = entryGradeSystem(d);
    const bounds = [0, ...getGradeCuts(gs), 1];
    const g = Math.min(Math.max(d.grade, 1), bounds.length - 1);
    const lo = bounds[g - 1], hi = bounds[g];
    const hasScore = d.score != null && d.avg != null;
    return { pct: lo + scoreNudge(d) * (hi - lo), precise: hasScore };
  }
  return null;
}

// 백분위 → 특정 등급제 기준 소수점 등급 (예: 2.34등급)
function pctToDecimalGrade(pct, gradeSystem) {
  const cuts = getGradeCuts(gradeSystem);
  const bounds = [0, ...cuts, 1];
  let g = bounds.length - 1;
  for (let i = 0; i < bounds.length - 1; i++) { if (pct <= bounds[i + 1]) { g = i + 1; break; } }
  const lo = bounds[g - 1], hi = bounds[g];
  const frac = hi > lo ? (pct - lo) / (hi - lo) : 0;
  return g + Math.min(0.99, Math.max(0, frac));
}

// 백분위 추정치를 기록된 석차등급 구간 안으로 클램프
// (추정 오차가 구간 경계를 넘어도 표시 등급이 실제 기록과 어긋나지 않도록)
function clampedEntryPct(d, subjectKey, studentName) {
  const info = calcPercentileInfo(d, subjectKey, studentName);
  if (!info) return null;
  const gs = entryGradeSystem(d);
  const bounds = [0, ...getGradeCuts(gs), 1];
  const g = Math.min(Math.max(d.grade, 1), bounds.length - 1);
  const lo = bounds[g - 1], hi = bounds[g];
  return { pct: Math.min(hi, Math.max(lo, info.pct)), precise: info.precise, gs, g, lo, hi };
}

// 자기 등급제 기준 소수점 등급 (정수부는 기록된 등급으로 고정)
function calcDecimalGrade(d, subjectKey, studentName) {
  if (d.isMid || d.grade == null) return null;
  const c = clampedEntryPct(d, subjectKey, studentName);
  if (!c) return null;
  const frac = c.hi > c.lo ? (c.pct - c.lo) / (c.hi - c.lo) : 0;
  return { value: c.g + Math.min(0.99, Math.max(0, frac)), precise: c.precise };
}

// 9등급제 환산 소수점 등급 (5등급제 과목 대상)
// 자기 등급 구간으로 클램프한 동일 백분위를 9등급제 커트라인에 대입 → 5등급 표시값과 항상 일관
function calcDecimalGrade9Equiv(d, subjectKey, studentName) {
  if (d.isMid || d.grade == null) return null;
  const c = clampedEntryPct(d, subjectKey, studentName);
  if (!c) return null;
  return { value: pctToDecimalGrade(c.pct, 9), precise: c.precise };
}

// ── Grade Table ──
function buildTable() {
  const data = allStudents[currentStudent] || {}; // MOCK
  // 고등학교 1~3학년
  const termOrder = ['1학년 1학기','1학년 2학기','2학년 1학기','2학년 2학기','3학년 1학기','3학년 2학기'];
  const subjList = [...checkedSubjects];

  let html = '<div style="overflow-x:auto"><table class="grade-table">';
  html += '<thead><tr><th>과목</th>';
  const usedTerms = termOrder.filter(t => Object.values(data).some(d => d.term === t && checkedSubjects.has(d.subject)));
  usedTerms.forEach(t => html += `<th>${t}${nsProvTh(data, t)}</th>`); // NS — 예상 학기
  html += '</tr></thead><tbody>';

  subjList.forEach(subj => {
    html += `<tr><td style="font-weight:700">${subj}</td>`;
    usedTerms.forEach(t => {
      const key = `${subj}__${t}`;
      const d = data[key];
      if (d) {
        const cls = `g${d.grade}`;
        let gradeLabel = d.grade + '등급';
        // 소수점 둘째자리 등급 (백분위 기반)
        const dec = calcDecimalGrade(d, key, currentStudent);
        if (dec) gradeLabel = dec.value.toFixed(2) + '등급' + (dec.precise ? '' : '<span style="opacity:.6">(추정)</span>');
        let extraInfo = '';
        if (d.isIlam && d.rank) {
          extraInfo = `<br><span style="font-size:9px;color:var(--ink-3)">${d.rank}위/${d.total ? d.total+'명' : '-'}</span>`;
        } else if (!d.isMid && d.total) {
          // 교과학습발달상황: 수강자수 기반 추정 석차/추월 인원
          const pa = getPeopleAhead(key, currentStudent);
          if (pa && pa.estimated) extraInfo = `<br><span style="font-size:9px;color:#8b5cf6;font-weight:700">앞에 약${pa.peopleAhead}명/${pa.total}명</span>`;
          else if (d.grade === 1) extraInfo = `<br><span style="font-size:9px;color:var(--ink-3)">${d.total}명 수강</span>`;
        }
        let conv9 = '';
        if (show9Grade && isFiveGradeEntry(d)) {
          const dec9 = calcDecimalGrade9Equiv(d, key, currentStudent);
          const label9 = dec9 ? dec9.value.toFixed(2) + '등급' + (dec9.precise ? '' : '<span style="opacity:.6">(추정)</span>') : (GRADE5_TO_9[d.grade] || '-');
          conv9 = `<br><span class="conv9-badge">≈9등급제 ${label9}</span>`;
        }
        html += `<td><span class="grade-badge ${cls}${d.isIlam ? ' prov' : ''}">${gradeLabel}</span>${extraInfo}<br><span style="font-size:10px;color:var(--ink-3)">${d.score !== null ? d.score+'점' : ''}</span>${conv9}</td>`;
      } else {
        html += `<td style="color:var(--ink-3);font-size:11px">-</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  document.getElementById('grade-table-wrap').innerHTML = html;
}

// ── 계열 분류 ──
// ── 2022 개정 교육과정 과목 분류 ──────────────────────────────────
// 키워드 우선순위: 앞에 있는 계열이 먼저 매칭됨
const CATEGORY_MAP = [
  { name: '전체과목', color: '#374151', keywords: [] },
  {
    name: '국어계열', color: '#2dd4bf',
    keywords: [
      // 공통
      '공통국어',
      // 일반/진로선택
      '국어','문학','독서','화법','작문','언어','매체','고전','문법',
      '독서와작문','주제탐구독서','문학과영상','현대문학감상','고전문학감상',
    ]
  },
  {
    name: '수학계열', color: '#e06b8b',
    keywords: [
      // 공통
      '공통수학',
      // 일반/진로선택
      '수학','미적분','확률','통계','기하','대수','수학과문화',
      '인공지능수학','직업수학','수학과제탐구',
    ]
  },
  {
    name: '영어계열', color: '#f59e0b',
    keywords: [
      // 공통
      '공통영어',
      // 일반/진로선택
      '영어','영문','영독','영작','영어회화','영어독해','영어작문',
      '심화영어','영미문학','영어권문화','실용영어','직업영어',
    ]
  },
  {
    name: '사회계열', color: '#8b5cf6',
    keywords: [
      // 공통
      '통합사회','한국사',
      // 일반/진로선택
      '사회','역사','도덕','윤리','정치','경제','법','지리',
      '세계사','동아시아','세계지리','한국지리',
      '생활과윤리','윤리와사상','정치와법','사회·문화','현대사회',
      '사회문화','여행지리','역사로탐구','경제수학','금융과경제',
    ]
  },
  {
    name: '과학계열', color: '#10b981',
    keywords: [
      // 공통
      '통합과학','과학탐구실험',
      // 일반/진로선택
      '과학','물리','화학','생명','지구','생물','지학',
      '물리학','화학','생명과학','지구과학',
      '과학사','기후변화','융합과학','고급물리','고급화학','고급생명','고급지구',
      '과학과제탐구','과학의역사',
    ]
  },
  {
    name: '제2외국어', color: '#f97316',
    keywords: [
      '중국어','일본어','러시아어','아랍어','베트남어','프랑스어','독일어',
      '스페인어','한문','고전그리스어','라틴어',
    ]
  },
  {
    name: '예체능·기타', color: '#94a3b8',
    keywords: [
      '체육','운동','스포츠','보건',
      '음악','미술','연극','영화','무용','사진','공예',
      '기술','가정','정보','인공지능','SW','소프트웨어',
      '진로','직업','창의','논술','실용',
    ]
  },
];

// 분류 함수: 키워드 완전일치 우선 → 부분일치 순
function classifySubject(subj) {
  const nsT = (typeof SubjectTable !== 'undefined') ? SubjectTable.lookup(subj) : null; // NS — 교육과정 과목표 우선
  if (nsT) return nsT;
  const s = subj.replace(/\s/g, '');
  for (const cat of CATEGORY_MAP.slice(1)) {
    // 완전 일치 우선
    if (cat.keywords.some(kw => s === kw.replace(/\s/g,''))) return cat.name;
  }
  for (const cat of CATEGORY_MAP.slice(1)) {
    // 부분 포함
    if (cat.keywords.some(kw => s.includes(kw.replace(/\s/g,'')))) return cat.name;
  }
  return '예체능·기타';
}

// 과목 기반명: 끝 숫자·로마숫자 제거 (공통국어1→공통국어, 수학Ⅰ→수학)
function getBaseName(subj) {
  return subj.replace(/[\dⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅰⅱⅲⅳⅴ]+$/u, '').trim();
}

// ── Chart ──
let currentChartCategory = null;

function buildChart() {
  const data = allStudents[currentStudent];
  const termOrder = ['1학년 1학기','1학년 2학기','2학년 1학기','2학년 2학기','3학년 1학기','3학년 2학기'];


  // X축은 항상 6개 학기 전체 고정 — 과목 유무와 무관하게 연속 표시 (선 연결 보장)
  const allUsedTerms = termOrder;

  // 계열별 그룹핑
  const categoryGroups = {};
  [...checkedSubjects].forEach(subj => {
    const cat = classifySubject(subj);
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(subj);
  });

  // 탭: 전체과목 + 실제 계열들
  const cats = ['전체과목', ...Object.keys(categoryGroups)];
  if (!currentChartCategory || !cats.includes(currentChartCategory)) {
    currentChartCategory = '전체과목';
  }

  // 탭 버튼 생성
  const tabWrap = document.getElementById('chart-tabs');
  tabWrap.innerHTML = '';
  cats.forEach(cat => {
    const catInfo = CATEGORY_MAP.find(c => c.name === cat) || CATEGORY_MAP[CATEGORY_MAP.length-1];
    const isActive = cat === currentChartCategory;
    const count = cat === '전체과목' ? [...checkedSubjects].length : (categoryGroups[cat]||[]).length;
    const btn = document.createElement('button');
    btn.textContent = `${cat} (${count})`;
    btn.style.cssText = [
      'padding:5px 12px','border-radius:20px','font-size:11px','font-weight:800',
      `border:1.5px solid ${catInfo.color}`,'cursor:pointer','transition:all .15s',
      `background:${isActive ? catInfo.color : '#f5fcf9'}`,
      `color:${isActive ? '#fff' : catInfo.color}`
    ].join(';');
    btn.onclick = () => { currentChartCategory = cat; buildChart(); };
    tabWrap.appendChild(btn);
  });

  // 현재 탭 과목 목록
  const subjsInCat = currentChartCategory === '전체과목'
    ? [...checkedSubjects]
    : (categoryGroups[currentChartCategory] || []);

  const catInfo = CATEGORY_MAP.find(c => c.name === currentChartCategory) || CATEGORY_MAP[CATEGORY_MAP.length-1];

  const datasets = [];

  if (currentChartCategory === '전체과목') {
    // NS — 교과별 평균 선 (과목 하나씩 그리면 한 학기 과목은 떨어진 점이 된다)
    nsTrendCatLines(data, subjsInCat, allUsedTerms).forEach(l => datasets.push(nsTrendDataset(l, true)));
  } else {
    // NS — 전체과목 탭과 같은 계산·모양 (예상 학기로 들어가는 선은 점선)
    nsTrendCatLines(data, subjsInCat, allUsedTerms).forEach(l => datasets.push(nsTrendDataset(l, true)));
  }

  if (trendChart) trendChart.destroy();
  const ctx = document.getElementById('trend-chart').getContext('2d');
  const isMidMode = currentSchoolLevel === 'middle';
  const achMap = {1:'A',2:'B',3:'C',4:'D',5:'E'};
  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels: nsProvLabels(allUsedTerms, nsProvTerms(data)), datasets }, // NS
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: {
          reverse: true, min: 1, max: gradeSystemMax,
          ticks: { stepSize: 1, min: 1, max: gradeSystemMax,
            callback: v => {
              if (v < 1 || v > gradeSystemMax || !Number.isInteger(v)) return '';
              return isMidMode ? achMap[v] : v+'등급';
            },
            font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,.06)' }
        },
        x: { ticks: { font: { size: 10 } } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 10 } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const nsTip = nsTrendTooltip(ctx, isMidMode); if (nsTip) return nsTip; // NS
              const actual = ctx.dataset._labels?.[ctx.dataIndex] || ctx.dataset.label;
              const isMidIlamMode = isMidMode && Object.values(allStudents[currentStudent]||{}).some(d => d.isMidIlam);
              const valLabel = isMidMode ? (achMap[ctx.parsed.y] || ctx.parsed.y) + (isMidIlamMode ? '(추정)' : '') : ctx.parsed.y+'등급';
              return `${actual}: ${valLabel}`;
            }
          }
        }
      }
    }
  });
}

// ════════════════
// 과목별 방사형(레이더) · 과목군별 세로 막대
// ════════════════
let radarChart = null, catBarChart = null;
const ACH_LETTER = { 1:'A', 2:'B', 3:'C', 4:'D', 5:'E' };

// 등급 값 → 표시 문자열 (고등학교 5등급제)
function fmtGrade(v) {
  if (v == null || isNaN(v)) return '-';
  return String(parseFloat(v.toFixed(2))) + '등급';
}

// 과목(기반명)별 평균 등급 — 축 순서는 과목군 → 가나다
function getRadarEntries(data, subjSet) {
  const m = {};
  Object.values(data || {}).forEach(d => {
    if (!subjSet.has(d.subject)) return;
    if (typeof d.grade !== 'number' || isNaN(d.grade)) return;
    const b = getBaseName(d.subject) || d.subject;
    if (!m[b]) m[b] = { sum: 0, cnt: 0, cat: classifySubject(d.subject), list: [] };
    m[b].sum += d.grade; m[b].cnt++; m[b].list.push(d); // NS
  });
  const order = CATEGORY_MAP.slice(1).map(c => c.name);
  return Object.entries(m).map(([name, v]) => ({
    name, cat: v.cat, cnt: v.cnt,
    avg: parseFloat(nsAvgInfo(v.list).avg.toFixed(2)) // NS — 학점 가중
  })).sort((a, b) =>
    (order.indexOf(a.cat) - order.indexOf(b.cat)) || a.name.localeCompare(b.name, 'ko'));
}

// 과목군별 평균 등급
function getCategoryAvgList(data, subjSet) {
  const g = {};
  Object.values(data || {}).forEach(d => {
    if (!subjSet.has(d.subject)) return;
    if (typeof d.grade !== 'number' || isNaN(d.grade)) return;
    const c = classifySubject(d.subject);
    if (!g[c]) g[c] = { sum: 0, cnt: 0, subjs: new Set(), list: [] };
    g[c].sum += d.grade; g[c].cnt++; g[c].subjs.add(d.subject); g[c].list.push(d); // NS
  });
  return CATEGORY_MAP.slice(1).filter(c => g[c.name]).map(c => ({
    cat: c.name, color: c.color, cnt: g[c.name].cnt, subjCnt: g[c.name].subjs.size,
    avg: parseFloat(nsAvgInfo(g[c.name].list).avg.toFixed(2)) // NS — 학점 가중
  }));
}

// 등급(작을수록 좋음) → 축 값(클수록 좋음)
function toAxisVal(avg) { return parseFloat((gradeSystemMax + 1 - avg).toFixed(2)); }
function axisTick(v) {
  return (v >= 1 && v <= gradeSystemMax && Number.isInteger(v))
    ? fmtGrade(gradeSystemMax + 1 - v) : '';
}

// 데이터 포인트/막대에 등급 숫자를 직접 표시하는 인라인 플러그인
function shortGrade(v) {
  if (v == null || isNaN(v)) return '';
  if (currentSchoolLevel === 'middle') return ACH_LETTER[Math.round(v)] || String(v);
  return String(parseFloat(v.toFixed(2)));
}
const LABEL_FONT = '"Nanum Gothic","Malgun Gothic","Apple SD Gothic Neo",sans-serif';

// 흰 테두리를 깔아 배경 위에서도 읽히게 그린다
function _strokeLabel(ctx, txt, x, y, size, color) {
  ctx.font = `800 ${size}px ${LABEL_FONT}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.lineJoin = 'round';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = color;
  ctx.fillText(txt, x, y);
}

// 레이더: 각 꼭짓점 옆에 등급 숫자
const radarLabelPlugin = {
  id: 'radarGradeLabel',
  afterDatasetsDraw(chart, args, opts) {
    const ctx = chart.ctx, scale = chart.scales.r;
    if (!scale) return;
    const size = (opts && opts.size) || 10, color = (opts && opts.color) || '#0f766e';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden || !ds._raw) return;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      meta.data.forEach((el, i) => {
        const txt = shortGrade(ds._raw[i]);
        if (!txt) return;
        const dx = el.x - scale.xCenter, dy = el.y - scale.yCenter;
        const len = Math.hypot(dx, dy);
        let tx, ty;
        if (len < 10) { tx = el.x; ty = el.y - 13; }
        else {
          // 바깥쪽 점은 안쪽으로 밀어 과목명과 겹치지 않게
          const dir = (len / (scale.drawingArea || 1)) > 0.72 ? -1 : 1;
          tx = el.x + (dx / len) * 14 * dir;
          ty = el.y + (dy / len) * 14 * dir;
        }
        _strokeLabel(ctx, txt, tx, ty, size, color);
      });
      ctx.restore();
    });
  }
};

// 세로 막대: 막대 상단에 등급 표시
const barLabelPlugin = {
  id: 'barGradeLabel',
  afterDatasetsDraw(chart, args, opts) {
    const ctx = chart.ctx, area = chart.chartArea;
    const size = (opts && opts.size) || 11;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden || !ds._raw) return;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      meta.data.forEach((el, i) => {
        const raw = ds._raw[i];
        if (raw == null) return;
        const txt = currentSchoolLevel === 'middle' ? shortGrade(raw) : shortGrade(raw) + '등급';
        const y = Math.max(area.top + size + 2, el.y - 6);
        _strokeLabel(ctx, txt, el.x, y, size, (ds.borderColor && ds.borderColor[i]) || '#334155');
      });
      ctx.restore();
    });
  }
};

function radarConfig(entries, opts) {
  const o = opts || {};
  const many = entries.length > 10;
  return {
    type: 'radar',
    plugins: [radarLabelPlugin],
    data: {
      labels: entries.map(e => e.name),
      datasets: [{
        label: '평균 등급',
        data: entries.map(e => toAxisVal(e.avg)),
        _raw: entries.map(e => e.avg),
        _cnt: entries.map(e => e.cnt),
        backgroundColor: 'rgba(45,212,191,.22)',
        borderColor: '#0d9488', borderWidth: 2.5,
        pointBackgroundColor: '#0d9488', pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5, pointRadius: 4.5, pointHoverRadius: 8
      }]
    },
    options: {
      animation: false, responsive: !o.png, maintainAspectRatio: false,
      layout: { padding: o.png ? 1 : 0 },
      scales: {
        r: {
          min: 0, max: gradeSystemMax, beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 9 }, color: '#6b8f83',
            backdropColor: 'rgba(255,255,255,.8)',
            // 점마다 등급 숫자를 찍으므로 눈금은 최상/최하만 남겨 겹침을 줄인다
            callback: v => (v === gradeSystemMax || v === 1) ? axisTick(v) : '' },
          pointLabels: { padding: 3, font: { size: many ? 9.5 : 11, weight: 'bold' }, color: '#33564a' },
          grid: { color: 'rgba(0,0,0,.09)' },
          angleLines: { color: 'rgba(0,0,0,.09)' }
        }
      },
      plugins: {
        title: o.title ? { display: true, text: o.title, font: { size: 12, weight: 'bold' }, padding: { top: 2, bottom: 2 }, color: '#0d3b32' } : { display: false },
        legend: { display: false },
        tooltip: { callbacks: { label: c =>
          `${c.label}: ${fmtGrade(c.dataset._raw[c.dataIndex])} (${c.dataset._cnt[c.dataIndex]}개 학기 평균)` } }
      }
    }
  };
}

function catBarConfig(list, opts) {
  const o = opts || {};
  return {
    type: 'bar',
    plugins: [barLabelPlugin],
    data: {
      labels: list.map(x => x.cat),
      datasets: [{
        label: '평균 등급',
        data: list.map(x => toAxisVal(x.avg)),
        _raw: list.map(x => x.avg),
        _cnt: list.map(x => x.cnt),
        _sub: list.map(x => x.subjCnt),
        backgroundColor: list.map(x => x.color + 'cc'),
        borderColor: list.map(x => x.color),
        borderWidth: 1.5, borderRadius: 6, maxBarThickness: 62
      }]
    },
    options: {
      animation: false, responsive: !o.png, maintainAspectRatio: false,
      layout: { padding: o.png ? 6 : 0 },
      scales: {
        y: { min: 0, max: gradeSystemMax, beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 10 }, color: '#6b8f83', callback: axisTick },
          grid: { color: 'rgba(0,0,0,.07)' } },
        x: { ticks: { font: { size: 10.5, weight: 'bold' }, color: '#33564a' },
          grid: { display: false } }
      },
      plugins: {
        title: o.title ? { display: true, text: o.title, font: { size: 13, weight: 'bold' }, color: '#0d3b32' } : { display: false },
        legend: { display: false },
        tooltip: { callbacks: { label: c =>
          `평균 ${fmtGrade(c.dataset._raw[c.dataIndex])} · 과목 ${c.dataset._sub[c.dataIndex]}개 / ${c.dataset._cnt[c.dataIndex]}개 학기` } }
      }
    }
  };
}


// 인쇄 시 차트가 화면 크기 그대로 그려져 페이지를 넘어가는 문제 방지 —
// 인쇄 스타일이 적용된 뒤 컨테이너 크기에 맞춰 다시 그린다.
function _resizeChartsForPrint() {
  [typeof trendChart !== 'undefined' ? trendChart : null, radarChart, catBarChart]
    .forEach(c => { if (c) { try { c.resize(); } catch (e) {} } });
}
window.addEventListener('beforeprint', _resizeChartsForPrint);
window.addEventListener('afterprint', _resizeChartsForPrint);
if (window.matchMedia) {
  const mq = window.matchMedia('print');
  if (mq.addEventListener) mq.addEventListener('change', _resizeChartsForPrint);
}

function buildRadarChart() {
  const card = document.getElementById('radar-card');
  const entries = nsRadarEntries(allStudents[currentStudent], checkedSubjects); // NS — 과목군별 / 과목별
  if (radarChart) { radarChart.destroy(); radarChart = null; }
  nsRadarHead(entries); // NS
  if (entries.length < 3) { card.style.display = 'none'; return; }  // 축 3개 미만이면 방사형이 의미 없음
  card.style.display = '';
  radarChart = new Chart(document.getElementById('radar-chart').getContext('2d'), nsRadarDecorate(radarConfig(entries, {}), entries)); // NS
}

function buildCatBarChart() {
  const card = document.getElementById('catbar-card');
  const list = getCategoryAvgList(allStudents[currentStudent], checkedSubjects);
  if (catBarChart) { catBarChart.destroy(); catBarChart = null; }
  if (list.length < 2) { card.style.display = 'none'; return; }
  card.style.display = '';
  catBarChart = new Chart(document.getElementById('catbar-chart').getContext('2d'), catBarConfig(list, {}));
}

// 오프스크린 캔버스 → PNG base64 (일괄 인쇄 · 엑셀용)
function renderConfigToBase64(w, h, config) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    const chart = new Chart(ctx, config);
    setTimeout(() => {
      const b64 = canvas.toDataURL('image/png').split(',')[1];
      chart.destroy(); canvas.remove(); resolve(b64);
    }, 200);
  });
}

async function renderRadarToBase64(subjSet, title) {
  const entries = nsRadarEntries(allStudents[currentStudent], subjSet, 'cat'); // NS — 인쇄는 과목군별
  if (entries.length < 3) return null;
  return renderConfigToBase64(520, 430, nsRadarDecorate(radarConfig(entries, { png: true, title: title || '과목별 방사형 그래프' }), entries)); // NS
}

async function renderCatBarToBase64(subjSet, title) {
  const list = getCategoryAvgList(allStudents[currentStudent], subjSet);
  if (list.length < 2) return null;
  return renderConfigToBase64(520, 360, catBarConfig(list, { png: true, title: title || '과목군별 등급 분석' }));
}

// 기준 색상에서 n개 팔레트 생성
function generatePalette(baseHex, n) {
  if (n <= 1) return [baseHex];
  const palettes = {
    '#2dd4bf': ['#2dd4bf','#0d9488','#99f6e4','#5eead4','#14b8a6'],
    '#e06b8b': ['#e06b8b','#be185d','#f9a8d4','#ec4899','#db2777'],
    '#f59e0b': ['#f59e0b','#d97706','#fcd34d','#fbbf24','#b45309'],
    '#8b5cf6': ['#8b5cf6','#7c3aed','#c4b5fd','#a78bfa','#6d28d9'],
    '#10b981': ['#10b981','#059669','#6ee7b7','#34d399','#047857'],
    '#94a3b8': ['#94a3b8','#64748b','#cbd5e1','#475569','#334155'],
  };
  const p = palettes[baseHex] || ['#2dd4bf','#0d9488','#99f6e4','#5eead4','#14b8a6'];
  return Array.from({length: n}, (_, i) => p[i % p.length]);
}

// ═══════════════════════════════════════════════
// NEAR-MISS: 등급 경계 아쉬운 과목 순위 (학년 필터 포함)
// ═══════════════════════════════════════════════
const ZSCORE_CUT9 = [null, 1.75, 1.23, 0.74, 0.25, -0.25, -0.74, -1.23, -1.75];
let currentNMGrade = '전체'; // '전체' | '1학년' | '2학년' | '3학년'

function calcGap(d, studentName, subjectKey) { return nsGapByAhead(calcGapBase(d, studentName, subjectKey), studentName, subjectKey); } // NS
function calcGapBase(d, studentName, subjectKey) {
  const g = d.grade;
  if (g <= 1) return null;
  // 9등급제: stddev 있을 때
  if (d.stddev != null && d.stddev > 0 && d.score != null && d.avg != null) {
    const z = (d.score - d.avg) / d.stddev;
    const zTarget = ZSCORE_CUT9[g - 1];
    const ptGap = (zTarget - z) * d.stddev;
    return { system:'9등급', grade:g, gap:parseFloat(ptGap.toFixed(1)),
             gapLabel:`${ptGap.toFixed(1)}점 필요`, sortKey:ptGap,
             detail:`내 점수 ${d.score}점 / 평균 ${d.avg}점 / 표준편차 ${d.stddev}점` };
  }
  // 5등급제: distArr 있을 때 (NEIS 교과학습발달상황)
  if (d.distArr && d.distArr.length >= 2) {
    const g0 = g - 1;
    const myBand = d.distArr[g0];
    let posInBand = 0.5;
    if (d.score != null && d.avg != null && myBand > 0) {
      const diff = (d.score - d.avg) / 100;
      posInBand = Math.min(0.95, Math.max(0.05, 0.5 + diff));
    }
    const gapPct = (1 - posInBand) * myBand;
    return { system:'5등급', grade:g, gap:parseFloat(gapPct.toFixed(1)),
             gapLabel:`약 ${gapPct.toFixed(1)}%p 차이`, sortKey:gapPct,
             detail: d.score != null ? `내 점수 ${d.score}점 / 평균 ${d.avg != null ? d.avg+'점':'-'}` : '점수 데이터 없음' };
  }
  // 전과목 성적 일람표 모드: 석차 기반으로 아쉬운 정도 표현
  if (d.isIlam && subjectKey && studentName) {
    const pa = calcPeopleAhead(subjectKey, studentName);
    if (pa) {
      const gapPct = parseFloat(((pa.peopleAhead / pa.total) * 100).toFixed(2));
      const detail = `현재 ${pa.myRank}위${pa.tieCount > 1 ? `~${pa.lastRank}위(동${pa.tieCount}명)` : ''} / ${pa.total}명 · 목표 ${pa.cutRank}위 이내`;
      const sysLabel = (d.gradeSystem || 5) === 9 ? '9등급(석차)' : '5등급(석차)';
      return { system: sysLabel, grade:g, gap:gapPct,
               gapLabel:`앞에 ${pa.peopleAhead}명 (${gapPct.toFixed(1)}%p)`, sortKey:pa.peopleAhead,
               detail };
    }
  }
  // 기본 fallback
  return { system:'등급', grade:g, gap:null, gapLabel:'석차 데이터 없음', sortKey:9999, detail:'' };
}

function buildNearMiss() {
  const data = allStudents[currentStudent];
  const termOrder = ['1학년 1학기','1학년 2학기','2학년 1학기','2학년 2학기','3학년 1학기','3학년 2학기'];

  // 학년 필터 탭 구성 — 학생이 실제 이수한 학년만 표시
  const availableGrades = new Set();
  Object.values(data).forEach(d => {
    const m = d.term.match(/^(\d)학년/);
    if (m) availableGrades.add(m[1]+'학년');
  });
  const gradeOptions = ['전체', ...[...availableGrades].sort()];

  const tabWrap = document.getElementById('nm-grade-tabs');
  tabWrap.innerHTML = '';
  if (!gradeOptions.includes(currentNMGrade)) currentNMGrade = '전체';

  gradeOptions.forEach(g => {
    const isActive = g === currentNMGrade;
    const btn = document.createElement('button');
    btn.textContent = g;
    btn.style.cssText = `padding:4px 12px;border-radius:20px;font-size:11px;font-weight:800;border:1.5px solid var(--good);cursor:pointer;transition:all .15s;background:${isActive?'var(--good)':'transparent'};color:${isActive?'#fff':'var(--good)'};font-family:inherit`;
    btn.onclick = () => { currentNMGrade = g; buildNearMiss(); };
    tabWrap.appendChild(btn);
  });

  // 필터링된 항목 생성
  const items = [];
  [...checkedSubjects].forEach(subj => {
    for (let i = termOrder.length-1; i >= 0; i--) {
      const term = termOrder[i];
      // 학년 필터 적용
      if (currentNMGrade !== '전체' && !term.startsWith(currentNMGrade)) continue;
      const d = data[`${subj}__${term}`];
      if (!d) continue;
      if (d.grade <= 1) break;
      const key = `${subj}__${term}`;
      const nm = calcGap(d, currentStudent, key);
      if (nm) items.push({ subj, term, ...nm });
      break;
    }
  });
  items.sort(nsGapCompare); // NS

  const wrap = document.getElementById('near-miss-content');
  if (!items.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--ink-3);padding:8px 0">해당 학년에 아쉬운 과목이 없거나 데이터가 없습니다.</div>';
    return;
  }

  const GC = {1:'#34C759',2:'#34C759',3:'#f59e0b',4:'#e06b8b',5:'#e06b8b',6:'#c0392b',7:'#a93226',8:'#922b21',9:'#7b241c'};
  let html = '<div class="nm-grid">';
  items.forEach((it, idx) => {
    const rank = idx+1;
    const medal = rank===1?'<b style="color:var(--accent)">1위</b>':rank===2?'<b style="color:var(--ink-2)">2위</b>':rank===3?'<b style="color:var(--ink-3)">3위</b>':`<span style="font-size:11px;font-weight:700;color:var(--ink-3)">${rank}위</span>`;
    const gc = GC[it.grade]||'#aeaeb2';
    const barPct = nsGapBar(it); // NS — 같은 등급 안에서의 위치 (오른쪽 끝 = 한 등급 위 커트)
    html += `<div style="background:var(--paper);border:1.5px solid var(--line-2);border-radius:12px;padding:10px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:14px">${medal}</span>
          <span style="font-size:12px;font-weight:800;color:var(--ink)">${it.subj}</span>
          <span style="font-size:10px;color:var(--ink-3)">${it.term}</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px">
          <span class="grade-badge g${it.grade}">${it.grade}등급</span>
          <span style="font-size:10px;font-weight:800;color:var(--good)">→ ${it.grade-1}등급 목표</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px" title="막대: 지금 등급에 든 학생 중 내 위치. 오른쪽 끝이 한 등급 위 커트라인입니다.">
        <div style="flex:1;background:var(--line);border-radius:99px;height:6px;overflow:hidden;${barPct===null?'display:none':''}">
          <div style="width:${(barPct||0).toFixed(0)}%;height:100%;background:linear-gradient(90deg,var(--good),#34C759);border-radius:99px"></div>
        </div>
        <span style="font-size:11px;font-weight:700;color:var(--good);white-space:nowrap">${it.gapLabel}</span>
      </div>
      ${it.detail?`<div style="font-size:10px;color:var(--ink-3)">${it.detail} · ${it.system}</div>`:''}
      ${(()=>{ const pa=getPeopleAhead(`${it.subj}__${it.term}`,currentStudent); if (!pa || pa.peopleAhead === null) return '';
        if (pa.estimated) return `<div style="font-size:10px;font-weight:800;color:#8b5cf6;margin-top:3px">앞에 <b>약 ${pa.peopleAhead}명</b> 추월 필요 (추정 ${pa.myRank}위/${pa.total}명 → ${pa.cutRank}위 이내) <span style="opacity:.65;font-weight:700">※ 원점수·분포 기반 추정</span></div>`;
        return `<div style="font-size:10px;font-weight:800;color:#8b5cf6;margin-top:3px">앞에 <b>${pa.peopleAhead}명</b> 추월 필요 (현재 ${pa.myRank}위${pa.tieCount>1?'~'+pa.lastRank+'위 동석차'+pa.tieCount+'명':''} → ${pa.cutRank}위 이내)</div>`; })()}
    </div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;
}

// 등급 경계 아쉬운 과목 — 구조화 데이터 (엑셀·인쇄에서 열 단위로 재사용)
function getNearMissItems(data, termOrder) {
  const items = [];
  [...checkedSubjects].forEach(subj => {
    for (let i = termOrder.length-1; i >= 0; i--) {
      const d = data[`${subj}__${termOrder[i]}`];
      if (!d) continue;
      if (d.grade <= 1) break;
      const key = `${subj}__${termOrder[i]}`;
      const nm = calcGap(d, currentStudent, key);
      if (nm) items.push({ subj, term:termOrder[i], ...nm });
      break;
    }
  });
  items.sort(nsGapCompare); // NS
  return items.map(it => {
    const pa = getPeopleAhead(`${it.subj}__${it.term}`, currentStudent);
    const paText = pa ? `앞에 ${pa.estimated?'약 ':''}${pa.peopleAhead}명 추월 필요(${pa.estimated?'추정 ':''}${pa.myRank}위/${pa.total}명 → ${pa.cutRank}위 이내${pa.estimated?', 원점수·분포 기반 추정':''})` : '';
    return { ...it, paText };
  });
}

function getNearMissText(data, termOrder) {
  return getNearMissItems(data, termOrder).map((it,i) =>
    `  ${i+1}위. ${it.subj} (${it.term}): 현재 ${it.grade}등급 → ${it.grade-1}등급 목표 / ${it.gapLabel}${it.detail?' / '+it.detail:''}${it.paText?' / '+it.paText:''}`
  ).join('\n');
}

// 병합 셀은 엑셀이 자동으로 행 높이를 맞춰주지 않으므로 줄 수를 직접 계산한다.
// (한글·전각 문자는 폭 2로 계산)
function _xlTextHeight(text, widthChars) {
  const w = Math.max(10, widthChars);
  let lines = 0;
  String(text).split('\n').forEach(l => {
    let n = 0;
    for (const ch of l) n += ch.charCodeAt(0) > 0x2E80 ? 2 : 1;
    lines += Math.max(1, Math.ceil(n / w));
  });
  return Math.min(160, Math.max(16, lines * 13.5 + 4));
}

// ── Prompt ──
let currentPromptType = 'student'; // 'student' | 'parent'

function setPromptType(type) {
  currentPromptType = type;
  const ps = document.getElementById('ptchip-student');
  const pp = document.getElementById('ptchip-parent');
  if (ps) ps.classList.toggle('active', type === 'student');
  if (pp) pp.classList.toggle('active', type === 'parent');
  buildPrompt(type);
}

function buildPrompt(promptType) {
  const type = promptType || currentPromptType || 'student';
  const data = allStudents[currentStudent] || {};
  const career = document.getElementById('career-inp').value.trim();
  const memo = document.getElementById('memo-inp').value.trim();
  const termOrder = ['1학년 1학기','1학년 2학기','2학년 1학기','2학년 2학기','3학년 1학기','3학년 2학기'];

  let gradeText = '';
  [...checkedSubjects].forEach(subj => {
    const termData = termOrder.map(t => {
      const d = data[`${subj}__${t}`];
      if (!d) return null;
      const gsLabel = (d.gradeSystem === 5 || customGradeSystemMode === 'force5') ? '5등급제' : '9등급제';
      return `${t}: ${d.grade}등급[${gsLabel}](${d.score !== null ? d.score+'점' : '-'})`;
    }).filter(Boolean);
    if (termData.length) gradeText += `- ${subj}: ${termData.join(' → ')}\n`;
  });

  const avgGrade = nsAvgStr(Object.values(data).filter(d => checkedSubjects.has(d.subject)));
  const nmText = getNearMissText(data, termOrder);

  let p = '';
  p += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  p += type === 'parent' ? `■ [학부모 상담용] 성적 분석 및 가정 연계 지도 AI 프롬프트\n` : `■ [학생 1:1 상담용] 성적 진단 및 학업·진로 코칭 AI 프롬프트\n`;
  p += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  p += `[학생 기본 정보 및 내신 개요]\n`;
  p += `• 학생명: ${currentStudent}\n`;
  p += `• 학교급: 고등학교 (${customGradeSystemMode === 'force5' ? '2028 개편 전면 5등급제 적용' : customGradeSystemMode === 'force9' ? '기존 9등급제 체계' : '1·2학년 5등급제 / 3학년 9등급제 자동 체계'})\n`;
  p += `• 선택과목 이수 학점 가중 평균: ${avgGrade}등급\n`;
  if (career) p += `• 희망 진로/학과: ${career}\n`;
  p += nsPromptBlock(currentStudent);

  p += `\n[과목별 성적 및 학기별 등급 추이]\n${gradeText || '등록된 내신 과목 성적이 없습니다.'}`;
  if (nmText) p += `\n[한 등급만 올리면 되는 경계선 과목 (추월 필요 인원 순)]\n${nmText}\n`;
  if (memo) p += `\n[담임교사 관찰 및 상담 메모]\n${memo}\n`;
  p += mkPromptData(currentStudent);

  p += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (type === 'parent') {
    p += `■ [AI 분석 요청 — 학부모 상담 가이드]\n`;
    p += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    p += `위 학생의 내신 및 모의고사 성적 데이터를 종합하여, 담임교사가 학부모 면담 시 전문적이면서도 따뜻하고 신뢰감 있게 상담할 수 있도록 아래 항목에 맞추어 구체적인 가이드를 작성해 주세요.\n\n`;
    p += `1. 학업 성취 총평 및 칭찬 포인트 (긍정적 강점)\n`;
    p += `   - 성적이 우수하거나 학기별로 꾸준히 향상된 과목과 그 의미\n`;
    p += `   - 학부모에게 전달할 자녀의 뛰어난 학습 태도 및 잠재력 피드백\n\n`;
    p += `2. 등급 경계선 과목 안내와 가정에서의 격려 방안\n`;
    p += `   - '한 등급만 올리면 되는 과목'의 수치(추월 필요 인원)를 학부모가 이해하기 쉽게 설명하는 방법\n`;
    p += `   - 가정에서 잔소리나 압박 대신 자신감을 심어줄 수 있는 대화 팁\n\n`;
    p += `3. 취약 과목 보완 및 학습 스트레스 완화 조언\n`;
    p += `   - 하락하거나 낮은 등급을 기록한 과목에 대한 객관적 진단\n`;
    p += `   - 가정에서 실천 가능한 환경적 지원 (수면, 스마트폰 관리, 긍정적 루틴 형성 등)\n\n`;
    p += `4. 대입/진로 방향성 및 학부모 안심 클로징 멘트\n`;
    p += `   - 현재 성적 패턴을 고려한 수시/정시 지원 가능 계열 안내\n`;
    p += `   - 입시 불안을 해소하고 학교와 가정이 함께 발맞춰 갈 수 있는 신뢰감 있는 상담 마무리 멘트\n`;
  } else {
    p += `■ [AI 분석 요청 — 학생 1:1 진로·학습 코칭]\n`;
    p += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    p += `위 학생의 내신 및 모의고사 성적 데이터를 바탕으로, 담임교사가 학생과 1:1로 마주앉아 실질적인 동기부여와 구체적인 학습 로드맵을 제시할 수 있도록 아래 항목에 맞추어 작성해 주세요.\n\n`;
    p += `1. 현재 성적 위치 진단 및 나만의 무기(강점) 발견\n`;
    p += `   - 우수 과목을 더 완벽한 1~2등급 무기로 유지·발전시키기 위한 전략\n`;
    p += `   - 학기별 성적 추이에서 드러나는 학생의 잠재력 칭찬\n\n`;
    p += `2. 실전 역전 목표: 한 등급 올리기 과목 집중 공략법\n`;
    p += `   - '한 등급만 올리면 되는 과목'의 추월 인원 수치를 활용한 구체적인 동기부여\n`;
    p += `   - 지필평가 1~2문제 또는 수행평가 점수 확보를 통한 실현 가능한 역전 방법\n\n`;
    p += `3. 취약 과목 방어 전략 및 자습 시간 배분 권장안\n`;
    p += `   - 성적 하락 과목의 원인 분석 및 최소 방어선 구축 팁\n`;
    p += `   - 주간 학습 계획 시 국·영·수·탐구 간 균형 잡힌 시간 배분안\n\n`;
    p += `4. 진로 연계 대입 수시/정시 대비 조언\n`;
    p += `   - 학생의 희망 진로(${career || '미정'})와 연계된 교과 세특(학교생활기록부) 챙기기 포인트\n`;
    p += `   - 수시 주요 교과 조합(국영수, 국영수사/과) 관리 요령 및 모의고사 병행 피드백\n\n`;
    p += `5. 담임교사의 1:1 격려와 코칭 한마디\n`;
    p += `   - 학생의 자존감을 높이고 다음 시험까지 지치지 않고 달릴 수 있는 따뜻한 응원 멘트\n`;
  }
  p += mkPromptAsk(currentStudent);
  p += `\n※ 실제 성적 데이터와 수치를 직접 인용하여 추상적이지 않고 현실적인 상담 대본 형태로 작성해 주세요.`;

  const outEl = document.getElementById('prompt-output');
  if (outEl) outEl.value = p;
  const card = document.getElementById('prompt-card');
  if (card) card.style.display = 'block';
}



// ═══════════════════════════════════════════════
// EXCEL DOWNLOAD (ExcelJS — 그래프 포함)
// ═══════════════════════════════════════════════

// 특정 과목 집합 + 제목으로 차트 PNG base64를 반환
async function renderChartToBase64(subjectList, title) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width = 700; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const termOrder = ['1학년 1학기','1학년 2학기','2학년 1학기','2학년 2학기','3학년 1학기','3학년 2학기'];
    const data = allStudents[currentStudent];

    // NS — 화면과 같은 교과별 평균 선 (계열 그래프도 첫 과목 등급 대신 학기 평균)
    let datasets = nsTrendCatLines(data, subjectList, termOrder).map(l => nsTrendDataset(l, title !== '전체과목'));
    if (!datasets.length) { resolve(null); return; }

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels: termOrder, datasets },
      options: {
        animation: false,
        responsive: false,
        plugins: {
          title: { display: true, text: `${currentStudent} — ${title} 등급 변화 추이`, font: { size: 14, weight: 'bold' } },
          legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } }
        },
        scales: {
          y: { reverse: true, min: 1, max: gradeSystemMax, ticks: { stepSize: 1, callback: v => (v >= 1 && v <= gradeSystemMax && Number.isInteger(v)) ? v+'등급' : '', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.08)' } },
          x: { ticks: { font: { size: 10 } } }
        }
      }
    });

    setTimeout(() => {
      const base64 = canvas.toDataURL('image/png').split(',')[1];
      chart.destroy();
      canvas.remove();
      resolve(base64);
    }, 200);
  });
}

async function downloadExcel() {
  if (!currentStudent) { showToast('학생을 먼저 선택하세요.'); return; }
  if (!_jobGuard()) return;
  _batchBusy(true);
  showToast('⏳ 엑셀 생성 중... 잠시만 기다려주세요.');
  try {
    await _downloadExcelCore();
  } catch (e) {
    console.error(e); showToast('엑셀 생성 실패: ' + e.message);
  } finally { _batchBusy(false); }
}

async function _downloadExcelCore() {

  const data = allStudents[currentStudent];
  const termOrder = ['1학년 1학기','1학년 2학기','2학년 1학기','2학년 2학기','3학년 1학기','3학년 2학기'];
  const usedTerms = termOrder.filter(t => Object.values(data).some(d => d.term === t && checkedSubjects.has(d.subject)));

  // ── 계열별 과목 그룹 ──
  const categoryGroups = {};
  [...checkedSubjects].forEach(subj => {
    const cat = classifySubject(subj);
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(subj);
  });

  // ── 평균 등급 계산 ──
  function calcAvg(subjList) {
    const set = new Set(subjList); // NS — 학점 가중
    return nsAvgStr(Object.values(data).filter(d => set.has(d.subject)));
  }

  // ── ExcelJS 워크북 생성 ──
  const wb = new ExcelJS.Workbook();
  wb.creator = '고교 성적 나침반 5.0';

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 시트0: 전체 요약 — 표(상단) + 그래프(하단) 세로 배치, 겹침 없음
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const ws0 = wb.addWorksheet('전체요약');
  ws0.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } };

  const H_TEAL = 'FF0D9488';
  const H_DARK = 'FF1E3A5F';
  const GC0 = { 1:'FFD1FAE5',2:'FFD1FAE5',3:'FFFEF3C7',4:'FFFFE4E6',5:'FFFCE7F3',6:'FFFECACA',7:'FFFCA5A5',8:'FFF87171',9:'FFEF4444' };

  // 행1: 제목
  const totalCols0 = 1 + usedTerms.length;
  ws0.mergeCells(1, 1, 1, Math.max(totalCols0, 8));
  const t0 = ws0.getCell(1,1);
  t0.value = `${currentStudent} 성적 종합 요약`;
  t0.font = { bold:true, size:15, color:{argb:H_TEAL} };
  t0.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFE6F6F1'} };
  t0.alignment = { horizontal:'center', vertical:'middle' };
  ws0.getRow(1).height = 30;

  // 행2: 전체 평균 요약
  const allGrades0 = Object.values(data).filter(d=>checkedSubjects.has(d.subject)).map(d=>d.grade);
  const nsSel0 = Object.values(data).filter(d=>checkedSubjects.has(d.subject)); // NS — 학점 가중
  const avg0 = nsAvgStr(nsSel0);
  ws0.mergeCells(2, 1, 2, Math.max(totalCols0, 8));
  const avg0cell = ws0.getCell(2,1);
  avg0cell.value = `전체 평균 등급${nsAvgTag(nsSel0)}: ${avg0}등급  |  선택 과목 수: ${checkedSubjects.size}개  |  이수 학기 수: ${usedTerms.length}학기`;
  avg0cell.font = { bold:true, size:10, color:{argb:'FF374151'} };
  avg0cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFEF9C3'} };
  avg0cell.alignment = { horizontal:'center', vertical:'middle' };
  ws0.getRow(2).height = 18;

  // 행4: 계열별 평균 등급 표
  const cats0 = Object.keys(categoryGroups);
  ws0.getRow(4).height = 18;
  ws0.mergeCells(4, 1, 4, 1 + cats0.length);
  const ch0 = ws0.getCell(4,1);
  ch0.value = '계열별 평균 등급';
  ch0.font = { bold:true, color:{argb:'FFFFFFFF'}, size:10 };
  ch0.fill = { type:'pattern', pattern:'solid', fgColor:{argb:H_DARK} };
  ch0.alignment = { horizontal:'center', vertical:'middle' };
  ws0.getCell(5,1).value='계열'; ws0.getCell(5,1).font={bold:true,size:9}; ws0.getCell(5,1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE6F6F1'}}; ws0.getCell(5,1).alignment={horizontal:'center'};
  cats0.forEach((cat,i)=>{ const c=ws0.getCell(5,2+i); c.value=cat; c.font={bold:true,size:9}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE6F6F1'}}; c.alignment={horizontal:'center'}; });
  ws0.getCell(6,1).value='평균 등급'; ws0.getCell(6,1).font={bold:true,size:9};
  cats0.forEach((cat,i)=>{ const c=ws0.getCell(6,2+i); c.value=calcAvg(categoryGroups[cat]); c.font={bold:true,color:{argb:'FFF59E0B'},size:10}; c.alignment={horizontal:'center'}; });
  ws0.getColumn(1).width = 16;
  cats0.forEach((_,i)=>{ ws0.getColumn(2+i).width=13; });

  // 행8: 과목별 성적 간략 표
  ws0.getRow(8).height = 18;
  ws0.getCell(8,1).value='과목'; ws0.getCell(8,1).font={bold:true,color:{argb:'FFFFFFFF'},size:9}; ws0.getCell(8,1).fill={type:'pattern',pattern:'solid',fgColor:{argb:H_TEAL}}; ws0.getCell(8,1).alignment={horizontal:'center',vertical:'middle'};
  usedTerms.forEach((t,i)=>{ const c=ws0.getCell(8,2+i); c.value=t.replace('학년 ','-'); c.font={bold:true,color:{argb:'FFFFFFFF'},size:9}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:H_TEAL}}; c.alignment={horizontal:'center',vertical:'middle'}; ws0.getColumn(2+i).width=11; });

  let subjRow0 = 9;
  [...checkedSubjects].forEach(subj => {
    ws0.getRow(subjRow0).height = 15;
    ws0.getCell(subjRow0,1).value=subj; ws0.getCell(subjRow0,1).font={bold:true,size:9};
    usedTerms.forEach((t,i)=>{
      const d=data[`${subj}__${t}`]; const gc=ws0.getCell(subjRow0,2+i);
      if(d){ gc.value=d.grade+'등급'; gc.fill={type:'pattern',pattern:'solid',fgColor:{argb:GC0[d.grade]||'FFFFFFFF'}}; gc.font={bold:true,size:9}; }
      else { gc.value='-'; gc.font={size:9}; }
      gc.alignment={horizontal:'center'};
    });
    subjRow0++;
  });

  // 그래프 시작 행 = 표 마지막 행 + 2 (0-based)
  const graphStartRow0 = subjRow0 + 1;

  // 전체과목 그래프 (표 아래 전체 너비)
  const overallChart0 = await renderChartToBase64([...checkedSubjects], '전체과목');
  if (overallChart0) {
    const imgId0 = wb.addImage({ base64: overallChart0, extension: 'png' });
    ws0.addImage(imgId0, { tl: { col:0, row: graphStartRow0 }, br: { col: Math.max(totalCols0+1, 9), row: graphStartRow0 + 14 } });
  }

  // 계열별 소형 그래프 — 전체과목 그래프 아래 2열 배열
  const catEntries0 = Object.entries(categoryGroups);
  const catGraphRow0 = graphStartRow0 + 15;
  const colsPerChart0 = Math.max(5, Math.floor((Math.max(totalCols0+1,9)) / 2));
  for (let ci = 0; ci < catEntries0.length; ci++) {
    const [cat, subjs] = catEntries0[ci];
    const imgB = await renderChartToBase64(subjs, cat);
    if (!imgB) continue;
    const imgId = wb.addImage({ base64: imgB, extension: 'png' });
    const col0 = (ci % 2) * colsPerChart0;
    const row0 = catGraphRow0 + Math.floor(ci / 2) * 13;
    ws0.addImage(imgId, { tl: { col: col0, row: row0 }, br: { col: col0 + colsPerChart0, row: row0 + 12 } });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 시트1: 성적 데이터 + 평균 등급 요약
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const ws1 = wb.addWorksheet('성적분석');

  // 헤더 스타일
  const hStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: H_TEAL } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } } };
  const subHStyle = { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F6F1' } }, alignment: { horizontal: 'center' } };
  const cellStyle = { alignment: { horizontal: 'center' }, border: { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } } };

  // 1행: 학생명 타이틀
  ws1.mergeCells(1, 1, 1, 1 + usedTerms.length * 2);
  const titleCell = ws1.getCell(1, 1);
  titleCell.value = `${currentStudent} 성적 분석표`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF0D9488' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(1).height = 28;

  // 2행: 평균 등급 요약
  const allGrades = Object.values(data).filter(d => checkedSubjects.has(d.subject)).map(d => d.grade);
  const nsSel1 = Object.values(data).filter(d => checkedSubjects.has(d.subject)); // NS — 학점 가중
  const overallAvg = nsAvgStr(nsSel1);
  ws1.mergeCells(2, 1, 2, 1 + usedTerms.length * 2);
  const avgCell = ws1.getCell(2, 1);
  avgCell.value = `전체 평균 등급${nsAvgTag(nsSel1)}: ${overallAvg}등급  |  선택 과목 수: ${checkedSubjects.size}개`;
  avgCell.font = { bold: true, size: 11, color: { argb: 'FF374151' } };
  avgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
  avgCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(2).height = 22;

  // 4행: 계열별 평균 등급 소계 헤더
  const cats = Object.keys(categoryGroups);
  ws1.mergeCells(4, 1, 4, 1 + cats.length);
  const catHdr = ws1.getCell(4, 1);
  catHdr.value = '계열별 평균 등급';
  Object.assign(catHdr, { font: hStyle.font, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }, alignment: { horizontal: 'center', vertical: 'middle' } });
  ws1.getRow(4).height = 20;

  // 5행: 계열 이름
  ws1.getCell(5, 1).value = '계열';
  Object.assign(ws1.getCell(5, 1), subHStyle);
  cats.forEach((cat, i) => {
    const c = ws1.getCell(5, 2 + i);
    c.value = cat;
    Object.assign(c, subHStyle);
  });

  // 6행: 계열 평균 등급 값
  ws1.getCell(6, 1).value = '평균 등급';
  ws1.getCell(6, 1).font = { bold: true };
  cats.forEach((cat, i) => {
    const c = ws1.getCell(6, 2 + i);
    c.value = calcAvg(categoryGroups[cat]);
    c.alignment = { horizontal: 'center' };
    c.font = { bold: true, color: { argb: 'FFF59E0B' } };
  });

  // 컬럼 너비 (계열별)
  ws1.getColumn(1).width = 16;
  cats.forEach((_, i) => { ws1.getColumn(2+i).width = 14; });

  // 8행: 과목별 성적 헤더
  const dataStartRow = 8;
  ws1.getCell(dataStartRow, 1).value = '과목';
  Object.assign(ws1.getCell(dataStartRow, 1), hStyle);
  usedTerms.forEach((t, i) => {
    const c = ws1.getCell(dataStartRow, 2 + i);
    c.value = t + ' (등급)';
    Object.assign(c, hStyle);
  });
  usedTerms.forEach((t, i) => {
    const c = ws1.getCell(dataStartRow, 2 + usedTerms.length + i);
    c.value = t + ' (원점수)';
    Object.assign(c, hStyle);
  });
  ws1.getRow(dataStartRow).height = 22;

  // 컬럼 너비 재설정 (데이터 영역)
  ws1.getColumn(1).width = 18;
  for (let i = 0; i < usedTerms.length * 2; i++) ws1.getColumn(2+i).width = 14;

  // 과목 데이터 행
  const GRADE_COLORS = { 1:'FFD1FAE5', 2:'FFD1FAE5', 3:'FFFEF3C7', 4:'FFFFE4E6', 5:'FFFCE7F3', 6:'FFFECACA', 7:'FFFCA5A5', 8:'FFF87171', 9:'FFEF4444' };
  let rowIdx = dataStartRow + 1;
  [...checkedSubjects].forEach(subj => {
    const row = ws1.getRow(rowIdx);
    const cat = classifySubject(subj);
    row.getCell(1).value = subj;
    row.getCell(1).font = { bold: true };
    usedTerms.forEach((t, i) => {
      const d = data[`${subj}__${t}`];
      const gc = row.getCell(2 + i);
      if (d) {
        gc.value = d.grade;
        gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRADE_COLORS[d.grade] || 'FFFFFFFF' } };
        gc.font = { bold: true };
      } else { gc.value = '-'; }
      gc.alignment = { horizontal: 'center' };
    });
    usedTerms.forEach((t, i) => {
      const d = data[`${subj}__${t}`];
      const sc = row.getCell(2 + usedTerms.length + i);
      sc.value = (d && d.score !== null) ? d.score : '-';
      sc.alignment = { horizontal: 'center' };
    });
    rowIdx++;
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 시트: 등급 경계 아쉬운 과목 순위
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const wsNM = wb.addWorksheet('등급 경계 순위');
  wsNM.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 } };

  // 제목
  wsNM.mergeCells(1, 1, 1, 8);
  const nmTitle = wsNM.getCell(1, 1);
  nmTitle.value = `${currentStudent} — 등급 경계 아쉬운 과목 순위`;
  nmTitle.font = { bold: true, size: 14, color: { argb: 'FFE06B8B' } };
  nmTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F3' } };
  nmTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  wsNM.getRow(1).height = 28;

  wsNM.mergeCells(2, 1, 2, 8);
  const nmSub = wsNM.getCell(2, 1);
  nmSub.value = '한 등급만 올리면 되는 과목 우선순위 · 투입 노력 대비 효율이 높은 과목부터 정렬';
  nmSub.font = { size: 10, color: { argb: 'FF9F1239' } };
  nmSub.alignment = { horizontal: 'center' };
  wsNM.getRow(2).height = 16;

  // 헤더
  const nmHdrStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE06B8B' } },
    alignment: { horizontal: 'center', vertical: 'middle' } };
  const nmHdrs = ['순위', '과목', '학기', '현재등급', '목표등급', '아쉬운 정도', '상세 정보', '추월 필요 인원'];
  nmHdrs.forEach((h, i) => {
    const c = wsNM.getCell(4, i + 1);
    c.value = h;
    Object.assign(c, nmHdrStyle);
  });
  wsNM.getRow(4).height = 20;

  // 컬럼 너비
  [4, 14, 12, 9, 9, 18, 30, 22].forEach((w, i) => { wsNM.getColumn(i + 1).width = w; });

  // 데이터 수집 (buildNearMiss와 동일 로직)
  const nmTermOrder = ['1학년 1학기','1학년 2학기','2학년 1학기','2학년 2학기','3학년 1학기','3학년 2학기'];
  const nmItems = [];
  [...checkedSubjects].forEach(subj => {
    for (let i = nmTermOrder.length - 1; i >= 0; i--) {
      const d = data[`${subj}__${nmTermOrder[i]}`];
      if (!d) continue;
      if (d.grade <= 1) break;
      const key = `${subj}__${nmTermOrder[i]}`;
      const nm = calcGap(d, currentStudent, key);
      if (nm) nmItems.push({ subj, term: nmTermOrder[i], ...nm });
      break;
    }
  });
  nmItems.sort(nsGapCompare); // NS

  const NM_GRADE_COLORS = { 1:'FFD1FAE5', 2:'FFFEF3C7', 3:'FFFFE4E6', 4:'FFFCE7F3', 5:'FFFECACA' };
  const medals = ['1위','2위','3위'];

  nmItems.forEach((it, idx) => {
    const rowNum = 5 + idx;
    const row = wsNM.getRow(rowNum);

    const rankLabel = medals[idx] || `${idx + 1}위`;
    const gradeColor = NM_GRADE_COLORS[it.grade] || 'FFFFFFFF';
    const pa = getPeopleAhead(`${it.subj}__${it.term}`, currentStudent);
    const paText = pa
      ? `${pa.estimated ? '약 ' : ''}${pa.peopleAhead}명 추월 필요 (${pa.myRank}위/${pa.total}명 → ${pa.cutRank}위 이내)`
      : '-';

    const rowData = [rankLabel, it.subj, it.term, `${it.grade}등급`, `${it.grade - 1}등급`, it.gapLabel, it.detail || '-', paText];
    rowData.forEach((val, ci) => {
      const c = row.getCell(ci + 1);
      c.value = val;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.font = { size: 10 };
      if (ci === 0) { c.font = { bold: true, size: 12 }; }
      if (ci === 1) { c.font = { bold: true, size: 10 }; c.alignment = { horizontal: 'left', vertical: 'middle' }; }
      if (ci === 3) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gradeColor } }; c.font = { bold: true, size: 10 }; }
      if (ci === 4) { c.font = { bold: true, size: 10, color: { argb: 'FF8B5CF6' } }; }
      if (ci === 7 && it.sortKey < 9999) {
        const urgency = it.sortKey <= 5 ? 'FFE06B8B' : it.sortKey <= 15 ? 'FFF59E0B' : 'FF7AAA97';
        c.font = { bold: true, size: 10, color: { argb: urgency } };
      }
    });

    // 행 배경 교차 색상
    // 각 열의 폭 기준으로 필요한 줄 수를 계산해 가장 큰 높이를 쓴다
    row.height = Math.max(18,
      _xlTextHeight(it.detail || '-', 30),
      _xlTextHeight(paText, 22),
      _xlTextHeight(it.subj, 14),
      _xlTextHeight(it.gapLabel, 18));

    if (idx % 2 === 1) {
      for (let ci = 1; ci <= 8; ci++) {
        const c = row.getCell(ci);
        if (!c.fill || c.fill.fgColor?.argb === 'FFFFFFFF' || !c.fill.fgColor) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        }
      }
    }
  });

  // 데이터 없을 때
  if (nmItems.length === 0) {
    wsNM.mergeCells(5, 1, 5, 8);
    wsNM.getCell(5, 1).value = '이미 모든 과목이 1등급입니다.';
    wsNM.getCell(5, 1).font = { bold: true, size: 12, color: { argb: 'FF34C759' } };
    wsNM.getCell(5, 1).alignment = { horizontal: 'center' };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 시트2+: 계열별 그래프 시트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const chartConfigs = [
    { title: '전체과목', subjects: [...checkedSubjects] },
    ...Object.entries(categoryGroups).map(([cat, subjs]) => ({ title: cat, subjects: subjs }))
  ];

  for (const cfg of chartConfigs) {
    if (!cfg.subjects.length) continue;
    const imgBase64 = await renderChartToBase64(cfg.subjects, cfg.title);
    if (!imgBase64) continue;

    const wsChart = wb.addWorksheet(`그래프_${cfg.title}`);
    wsChart.getRow(1).height = 24;
    const titleC = wsChart.getCell(1, 1);
    titleC.value = `${currentStudent} — ${cfg.title} 등급 변화 추이`;
    titleC.font = { bold: true, size: 13, color: { argb: 'FF0D9488' } };
    wsChart.mergeCells(1, 1, 1, 10);

    // 해당 계열 과목 목록 + 계열 평균 등급
    const avg = calcAvg(cfg.subjects);
    wsChart.getCell(2, 1).value = `과목: ${cfg.subjects.join(', ')}   |   계열 평균 등급: ${avg}등급`;
    wsChart.getCell(2, 1).font = { size: 10, color: { argb: 'FF6B7280' } };
    wsChart.mergeCells(2, 1, 2, 10);

    const imageId = wb.addImage({ base64: imgBase64, extension: 'png' });
    wsChart.addImage(imageId, { tl: { col: 0, row: 2 }, br: { col: 10, row: 22 } });
    wsChart.getColumn(1).width = 14;
  }

  // ── 다운로드 ──
  nsAddExcelSheet(wb, currentStudent); // NS
  mkAddExcelSheet(wb, currentStudent); // MOCK
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${currentStudent}_성적분석.xlsx`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('엑셀 다운로드 완료! (그래프 포함)');
}


// ═══════════════════════════════════════════════
// 인쇄 · 반 전체 일괄 처리
// ═══════════════════════════════════════════════
const TERM_ORDER_STD = ['1학년 1학기','1학년 2학기','2학년 1학기','2학년 2학기','3학년 1학기','3학년 2학기'];

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// 학생이 이수한 전체 과목 집합
function _subjectsOf(name) {
  const s = new Set();
  Object.values(allStudents[name] || {}).forEach(d => s.add(d.subject));
  return s;
}

function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

function _avgOf(name, subjSet) {
  return nsAvgInfo(Object.values(allStudents[name] || {}).filter(d => subjSet.has(d.subject))).avg; // NS — 학점 가중
}

// ── 진행률 표시 ──
function _prog(pct, txt) {
  const box = document.getElementById('batch-prog');
  if (pct < 0) { box.classList.remove('on'); document.getElementById('batch-prog-txt').textContent = ''; return; }
  box.classList.add('on');
  document.getElementById('batch-prog-bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
  document.getElementById('batch-prog-txt').textContent = txt || '';
}
let _jobRunning = false;
function _batchBusy(on) {
  _jobRunning = on;
  document.querySelectorAll('.batch-btn').forEach(b => b.disabled = on);
  document.querySelectorAll('.act-btn, .gen-btn').forEach(b => b.disabled = on);
}
// 작업이 겹치면 학생 선택 상태가 꼬이므로 동시 실행을 막는다
function _jobGuard() {
  if (_jobRunning) { showToast('⏳ 작업이 진행 중입니다. 잠시만 기다려주세요.'); return false; }
  return true;
}
function _batchGuard() {
  const names = mkBatchNames(); // MOCK — 내신 + 모의고사 합집합
  if (!names.length) { showToast('파일을 먼저 업로드해주세요.'); return null; }
  return names;
}
const _sleep = ms => new Promise(r => setTimeout(r, ms));

// 현재 선택 상태 저장 / 복원
function _pushCtx() { return { s: currentStudent, c: checkedSubjects }; }
function _popCtx(ctx) {
  currentStudent = ctx.s; checkedSubjects = ctx.c;
  if (currentStudent && document.getElementById('result-area').style.display !== 'none') {
    // MOCK — 내신이 없는 학생(모의고사만)이면 내신 빌더를 건너뛴다
    if (allStudents[currentStudent]) {
      buildSummary(); buildTable(); buildChart(); buildRadarChart(); buildCatBarChart(); buildNearMiss();
    }
    buildPrompt();
    nsBuildAll(); // NS
    if (typeof renderMockTab === 'function') { try { renderMockTab(); } catch (e) {} } // MOCK
  }
}
function _setCtx(name) { currentStudent = name; checkedSubjects = _subjectsOf(name); }

// ── 개별 학생 인쇄 ──
function printCurrent() {
  if (!currentStudent) { showToast('학생을 먼저 선택하세요.'); return; }
  if (!_jobGuard()) return;
  if (document.getElementById('result-area').style.display === 'none') {
    showToast('먼저 [분석 & 상담 프롬프트 생성]을 눌러주세요.'); return;
  }
  const avg = _avgOf(currentStudent, checkedSubjects);
  document.getElementById('print-name').textContent = `${currentStudent} 성적 분석 상담 자료`;
  document.getElementById('print-meta').innerHTML =
    `${'고등학교'} · 선택 과목 ${checkedSubjects.size}개` +
    (avg !== null ? ` · 평균 ${avg.toFixed(2)}${'등급'}` : '') +
    `<br>출력일 ${_todayStr()}`;
  window.print();
}

// ── 학생 1명 인쇄 블록 HTML ──
async function _buildStudentBlock(name, idx, total, withChart) {
  _setCtx(name);
  if (!allStudents[name]) return await mkOnlyStudentBlock(name, idx, total, withChart); // MOCK
  const mkBlk = await mkPrintBlock(name, withChart); // MOCK
  const nsBlk = await nsPrintBlock(name, withChart); // NS
  buildSummary(); buildTable();
  const summary = document.getElementById('summary-content').innerHTML;
  const table = document.getElementById('grade-table-wrap').innerHTML;
  const nmItems = getNearMissItems(allStudents[name], TERM_ORDER_STD);
  const avg = _avgOf(name, checkedSubjects);
  let chartImg = '', radarImg = '', catBarImg = '';
  if (withChart) {
    // NS — 등급 변화 추이(전과목)는 선이 너무 많아 인쇄에서 뺀다. 반영 조합별 평균 추이와 과목별 성적표가 대신한다.
    const rb64 = await renderRadarToBase64(checkedSubjects, '과목별 방사형 그래프');
    if (rb64) radarImg = `<img class="bp-chart2" src="data:image/png;base64,${rb64}" alt="과목별 방사형 그래프">`;
    const cb64 = await renderCatBarToBase64(checkedSubjects, '과목군별 등급 분석');
    if (cb64) catBarImg = `<img class="bp-chart2" src="data:image/png;base64,${cb64}" alt="과목군별 등급 분석">`;
  }
  const meta = `${'고등학교'} · 과목 ${checkedSubjects.size}개` +
    (avg !== null ? ` · 평균 ${avg.toFixed(2)}${'등급'}` : '');
  return `
  <section class="bp-student">
    <div class="print-head" style="display:flex">
      <div class="ph-name">${escHtml(name)} 성적 분석 상담 자료</div>
      <div class="ph-meta">${meta}<br>출력일 ${_todayStr()} · ${idx}/${total}</div>
    </div>
    <div class="bp-sec">학생 요약</div>
    <div>${summary}</div>
    <div class="bp-sec">과목별 성적 현황</div>
    <div>${table}</div>
    ${chartImg ? `<div class="bp-sec">등급 변화 추이</div>${chartImg}` : ''}
    ${(radarImg || catBarImg) ? `<div class="bp-sec">강점 · 약점 방사형 · 과목군별 등급</div><div class="bp-charts2">${radarImg}${catBarImg}</div>${nsRadarPrintNote(name)}` : ''}
    ${nmItems.length ? `<div class="bp-sec">등급 경계 아쉬운 과목</div>
    <table class="bp-nm-table"><thead><tr><th>순위</th><th>과목</th><th>학기</th><th>등급</th><th>한 등급 상승에 필요한 조건</th></tr></thead><tbody>${
      nmItems.map((it, i) => `<tr><td class="c">${i + 1}</td><td class="s">${escHtml(it.subj)}</td><td class="c">${escHtml(it.term.replace('학년 ', '-'))}</td><td class="c g">${it.grade}&rarr;${it.grade - 1}</td><td>${
        [it.gapLabel, it.detail, it.paText].filter(Boolean).map(escHtml).join('<br>')}</td></tr>`).join('')
    }</tbody></table>` : ''}
    ${nsBlk}
    ${mkBlk}
    <div class="print-foot" style="display:block">고교 성적 나침반 5.0 · 2028 개편 5등급제 담임 상담 자료 · 교내 상담 목적으로만 사용해 주세요.</div>
  </section>`;
}

// ── 전체 학생 인쇄 ──
async function batchPrint() {
  if (!_jobGuard()) return;
  const names = _batchGuard(); if (!names) return;
  const ctx = _pushCtx(); _batchBusy(true);
  const area = document.getElementById('batch-print-area');
  area.innerHTML = '';
  try {
    let out = '';
    for (let i = 0; i < names.length; i++) {
      _prog((i / names.length) * 100, `인쇄본 생성 중… ${i + 1}/${names.length}  ${names[i]}`);
      await _sleep(0);
      out += await _buildStudentBlock(names[i], i + 1, names.length, true);
    }
    area.innerHTML = out;
    _prog(100, '인쇄 창을 여는 중…');
    document.body.classList.add('batch-print');
    await _sleep(150);
    window.print();
    showToast(`${names.length}명 인쇄본을 준비했습니다.`);
  } catch (e) {
    console.error(e); showToast('일괄 인쇄 생성 실패: ' + e.message);
  } finally {
    document.body.classList.remove('batch-print');
    area.innerHTML = '';
    _prog(-1); _batchBusy(false); _popCtx(ctx);
  }
}

// ── 전체 학생 프롬프트 ──
function batchPrompts(targetType) {
  if (!_jobGuard()) return;
  const names = _batchGuard(); if (!names) return;
  const ctx = _pushCtx(); _batchBusy(true);
  const careerEl = document.getElementById('career-inp'), memoEl = document.getElementById('memo-inp');
  const cSave = careerEl.value, mSave = memoEl.value;
  careerEl.value = ''; memoEl.value = '';
  const type = targetType || currentPromptType || 'student';
  const typeLabel = type === 'parent' ? '학부모상담용' : '학생상담용';
  try {
    let out = `고교 성적 상담 AI 프롬프트 [${typeLabel}] — 전체 ${names.length}명\n출력일: ${_todayStr()}\n`;
    out += `등급 체계: ${customGradeSystemMode === 'force5' ? '2028 개편 전면 5등급제' : customGradeSystemMode === 'force9' ? '기존 9등급제' : '1·2학년 5등급제 / 3학년 9등급제'}\n`;
    out += `※ 학생별로 아래 블록을 하나씩 복사해 ChatGPT, Claude, Gemini 등에 붙여넣으세요.\n`;
    names.forEach((n, i) => {
      _setCtx(n); buildPrompt(type);
      out += `\n\n\n╔═══════════════════════════════════════════════\n`;
      out += `║  [${i + 1}/${names.length}]  ${n} 학생 (${typeLabel})\n`;
      out += `╚═══════════════════════════════════════════════\n\n`;
      out += document.getElementById('prompt-output').value + '\n';
    });
    _downloadText(out, `전체학생_${typeLabel}_프롬프트_${names.length}명.txt`);
    showToast(`${names.length}명 ${typeLabel} 프롬프트를 .txt로 저장했습니다.`);
  } catch (e) {
    console.error(e); showToast('프롬프트 생성 실패: ' + e.message);
  } finally {
    careerEl.value = cSave; memoEl.value = mSave;
    _batchBusy(false); _popCtx(ctx);
  }
}

function _downloadText(txt, filename) {
  const blob = new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── 전체 학생 엑셀 (학생별 시트 + 명단 비교) ──
function _safeSheetName(name, used) {
  let s = String(name).replace(/[\[\]\*\?\/\\:]/g, ' ').trim().slice(0, 28) || '학생';
  const base = s; let k = 2;
  while (used.has(s)) { s = `${base}_${k++}`.slice(0, 31); }
  used.add(s); return s;
}

async function batchExcel() {
  if (!_jobGuard()) return;
  const names = _batchGuard(); if (!names) return;
  const ctx = _pushCtx(); _batchBusy(true);
  try {
    const H_TEAL = 'FF0D9488', H_DARK = 'FF1E3A5F';
    const GC = { 1:'FFD1FAE5',2:'FFD1FAE5',3:'FFFEF3C7',4:'FFFFE4E6',5:'FFFCE7F3',6:'FFFECACA',7:'FFFCA5A5',8:'FFF87171',9:'FFEF4444' };
    const isMid = currentSchoolLevel === 'middle';
    const achMap = { 1:'A', 2:'B', 3:'C', 4:'D', 5:'E' };
    const wb = new ExcelJS.Workbook();
    wb.creator = '고교 성적 나침반 5.0';

    // ── 시트0: 학생 명단 ──
    const wsL = wb.addWorksheet('학생명단');
    wsL.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } };
    wsL.mergeCells(1, 1, 1, 6);
    const lt = wsL.getCell(1, 1);
    lt.value = `전체 학생 성적 요약 (${names.length}명) · ${_todayStr()}`;
    lt.font = { bold: true, size: 14, color: { argb: H_TEAL } };
    lt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F6F1' } };
    lt.alignment = { horizontal: 'center', vertical: 'middle' };
    wsL.getRow(1).height = 28;

    const lheads = ['번호', '이름', isMid ? '평균 성취도' : '평균 등급', '이수 과목 수', '최고 과목', '최저 과목'];
    lheads.forEach((h, i) => {
      const c = wsL.getCell(3, i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: H_TEAL } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    wsL.getRow(3).height = 20;
    [6, 14, 13, 13, 22, 22].forEach((w, i) => wsL.getColumn(i + 1).width = w);

    names.forEach((n, i) => {
      const subj = _subjectsOf(n);
      const avg = _avgOf(n, subj);
      const entries = Object.values(allStudents[n] || {}).filter(d => subj.has(d.subject));
      let best = null, worst = null;
      entries.forEach(d => {
        if (typeof d.grade !== 'number' || isNaN(d.grade)) return;
        if (!best || d.grade < best.grade) best = d;
        if (!worst || d.grade > worst.grade) worst = d;
      });
      const lab = d => d ? `${d.subject} (${isMid ? (achMap[d.grade] || d.grade) : d.grade + '등급'})` : '-';
      const rw = 4 + i;
      wsL.getCell(rw, 1).value = i + 1;
      wsL.getCell(rw, 2).value = n;
      wsL.getCell(rw, 2).font = { bold: true, size: 10 };
      const ac = wsL.getCell(rw, 3);
      ac.value = avg === null ? '-' : Number(avg.toFixed(2));
      ac.font = { bold: true, size: 10 };
      if (avg !== null) ac.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GC[Math.round(avg)] || 'FFFFFFFF' } };
      wsL.getCell(rw, 4).value = subj.size;
      wsL.getCell(rw, 5).value = lab(best);
      wsL.getCell(rw, 6).value = lab(worst);
      [1, 3, 4].forEach(c => wsL.getCell(rw, c).alignment = { horizontal: 'center' });
      for (let c = 1; c <= 6; c++) wsL.getCell(rw, c).border = { bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } } };
      wsL.getRow(rw).height = 16;
    });
    wsL.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + names.length, column: 6 } };
    wsL.views = [{ state: 'frozen', ySplit: 3 }];

    // ── 학생별 시트 ──
    const used = new Set(['학생명단']);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      _prog((i / names.length) * 100, `엑셀 생성 중… ${i + 1}/${names.length}  ${name}`);
      await _sleep(0);
      _setCtx(name);
      const data = allStudents[name] || {}; // MOCK
      const subj = [...checkedSubjects];
      const usedTerms = TERM_ORDER_STD.filter(t => Object.values(data).some(d => d.term === t && checkedSubjects.has(d.subject)));
      const ws = wb.addWorksheet(_safeSheetName(name, used));
      ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } };

      const totalCols = Math.max(1 + usedTerms.length, 6);
      ws.mergeCells(1, 1, 1, totalCols);
      const t = ws.getCell(1, 1);
      t.value = `${name} 성적 분석`;
      t.font = { bold: true, size: 14, color: { argb: H_TEAL } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F6F1' } };
      t.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;

      const avg = _avgOf(name, checkedSubjects);
      ws.mergeCells(2, 1, 2, totalCols);
      const a2 = ws.getCell(2, 1);
      a2.value = `평균 ${isMid ? '성취도' : '등급'}: ${avg === null ? '-' : avg.toFixed(2)}` +
        `  |  과목 ${subj.length}개  |  ${usedTerms.length}개 학기  |  ${_todayStr()}`;
      a2.font = { bold: true, size: 10, color: { argb: 'FF374151' } };
      a2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
      a2.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 18;

      // 과목 × 학기 표
      ws.getRow(4).height = 19;
      const hc = ws.getCell(4, 1);
      hc.value = '과목';
      hc.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: H_TEAL } };
      hc.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getColumn(1).width = 22;
      usedTerms.forEach((tm, k) => {
        const c = ws.getCell(4, 2 + k);
        c.value = tm.replace('학년 ', '-');
        c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: H_TEAL } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getColumn(2 + k).width = 12;
      });
      // 아쉬운 과목 표는 폭이 넓어야 읽히므로 최소 8열을 확보한다
      const NM_COLS = Math.max(totalCols, 8);
      for (let k = 2; k <= NM_COLS; k++) {
        if (!ws.getColumn(k).width) ws.getColumn(k).width = 12;
      }
      let r = 5;
      subj.forEach(s => {
        ws.getRow(r).height = 16;
        ws.getCell(r, 1).value = s;
        ws.getCell(r, 1).font = { bold: true, size: 9.5 };
        usedTerms.forEach((tm, k) => {
          const d = data[`${s}__${tm}`];
          const c = ws.getCell(r, 2 + k);
          if (d) {
            c.value = isMid ? (achMap[d.grade] || d.grade) : d.grade + '등급';
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GC[d.grade] || 'FFFFFFFF' } };
            c.font = { bold: true, size: 9.5 };
          } else { c.value = '-'; c.font = { size: 9.5 }; }
          c.alignment = { horizontal: 'center' };
        });
        r++;
      });

      // 계열별 평균
      r += 1;
      const cats = {};
      subj.forEach(s => { const cat = classifySubject(s); (cats[cat] = cats[cat] || []).push(s); });
      const catNames = Object.keys(cats);
      ws.mergeCells(r, 1, r, Math.max(1 + catNames.length, 2));
      const ch = ws.getCell(r, 1);
      ch.value = '계열별 평균';
      ch.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      ch.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: H_DARK } };
      ch.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(r).height = 18;
      r++;
      ws.getCell(r, 1).value = '계열';
      ws.getCell(r, 1).font = { bold: true, size: 9 };
      ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F6F1' } };
      catNames.forEach((cat, k) => {
        const c = ws.getCell(r, 2 + k);
        c.value = cat; c.font = { bold: true, size: 9 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F6F1' } };
        c.alignment = { horizontal: 'center' };
      });
      r++;
      ws.getCell(r, 1).value = '평균';
      ws.getCell(r, 1).font = { bold: true, size: 9 };
      catNames.forEach((cat, k) => {
        const g = [];
        cats[cat].forEach(s => Object.values(data).filter(d => d.subject === s).forEach(d => g.push(d)));
        const c = ws.getCell(r, 2 + k);
        const nsv = nsAvgInfo(g).avg; c.value = nsv === null ? '-' : Number(nsv.toFixed(2)); // NS — 학점 가중
        c.font = { bold: true, size: 10, color: { argb: 'FFF59E0B' } };
        c.alignment = { horizontal: 'center' };
      });
      r += 2;

      // 등급 경계 아쉬운 과목 — 한 줄에 몰아넣지 않고 열로 나눠 배치한다
      const nmItems = getNearMissItems(data, TERM_ORDER_STD);
      if (nmItems.length) {
        ws.mergeCells(r, 1, r, NM_COLS);
        const nh = ws.getCell(r, 1);
        nh.value = '등급 경계 아쉬운 과목 (한 등급 올리기 쉬운 순)';
        nh.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        nh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE06B8B' } };
        nh.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(r).height = 19;
        r++;

        // 열 머리글: 과목 | 학기 | 등급 | 필요 조건(병합)
        const nmHead = ['과목', '학기', '등급'];
        nmHead.forEach((v, k) => {
          const c = ws.getCell(r, k + 1);
          c.value = v;
          c.font = { bold: true, size: 9, color: { argb: 'FF9F1239' } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F3' } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        ws.mergeCells(r, 4, r, NM_COLS);
        const dh = ws.getCell(r, 4);
        dh.value = '한 등급 상승에 필요한 조건';
        dh.font = { bold: true, size: 9, color: { argb: 'FF9F1239' } };
        dh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F3' } };
        dh.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(r).height = 17;
        r++;

        // 병합 영역(4열~NM_COLS)의 실제 폭을 문자 수로 환산
        let detailWidth = 0;
        for (let k = 4; k <= NM_COLS; k++) detailWidth += (ws.getColumn(k).width || 8.43);

        nmItems.forEach((it, idx) => {
          const detail = [it.gapLabel, it.detail, it.paText].filter(Boolean).join('\n');
          const label = `${idx + 1}위. ${it.subj}`;
          ws.getCell(r, 1).value = label;
          ws.getCell(r, 1).font = { bold: true, size: 9.5 };
          ws.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
          ws.getCell(r, 2).value = it.term.replace('학년 ', '-');
          ws.getCell(r, 2).font = { size: 9 };
          ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'top' };
          const gc = ws.getCell(r, 3);
          gc.value = `${it.grade}→${it.grade - 1}`;
          gc.font = { bold: true, size: 9.5, color: { argb: 'FF8B5CF6' } };
          gc.alignment = { horizontal: 'center', vertical: 'top' };
          ws.mergeCells(r, 4, r, NM_COLS);
          const dc = ws.getCell(r, 4);
          dc.value = detail;
          dc.font = { size: 9 };
          dc.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
          // 과목명이 긴 경우도 잘리지 않도록 두 열 중 큰 높이를 쓴다
          ws.getRow(r).height = Math.max(
            _xlTextHeight(detail, detailWidth),
            _xlTextHeight(label, ws.getColumn(1).width || 22));
          if (idx % 2 === 1) {
            for (let k = 1; k <= NM_COLS; k++) {
              ws.getCell(r, k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
            }
          }
          r++;
        });
      }

      // 등급 변화 그래프
      const b64 = await renderChartToBase64(subj, '전체과목');
      if (b64) {
        const imgId = wb.addImage({ base64: b64, extension: 'png' });
        ws.addImage(imgId, { tl: { col: 0, row: r }, br: { col: Math.max(totalCols, 7), row: r + 15 } });
      }
    }

    mkAppendBatchStudentSheets(wb, names); // MOCK
    mkAddBatchExcelSheet(wb, names); // MOCK
    _prog(100, '파일 저장 중…');
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `전체학생_성적분석_${names.length}명.xlsx`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`${names.length}명 엑셀 다운로드 완료! (그래프 포함)`);
  } catch (e) {
    console.error(e); showToast('일괄 엑셀 생성 실패: ' + e.message);
  } finally {
    _prog(-1); _batchBusy(false); _popCtx(ctx);
  }
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
function copyPrompt() {
  const txt = document.getElementById('prompt-output').value;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '복사됨!'; btn.style.background = '#10b981';
    showToast('클립보드에 복사됐습니다!');
    setTimeout(() => { btn.innerHTML = '복사'; btn.style.background = ''; }, 2000);
  }).catch(() => { document.getElementById('prompt-output').select(); document.execCommand('copy'); showToast('복사됐습니다!'); });
}

function scrollToPrompt() {
  document.getElementById('prompt-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetAll(silent) {
  if (!silent && !confirm('모든 데이터를 초기화할까요?')) return;
  allStudents = {}; currentStudent = null; checkedSubjects.clear(); currentNMGrade = '전체';
  ilamData = null; termGradeSystemMap = {};
  show9Grade = false;
  const c9t = document.getElementById('conv9-toggle');
  if (c9t) { c9t.classList.remove('active'); document.getElementById('conv9-toggle-txt').textContent = '9등급제로 환산해보기'; document.getElementById('conv9-note').style.display = 'none'; }
  document.getElementById('file-input').value = '';
  const uz = document.getElementById('upload-zone');
  uz.classList.remove('upload-done');
  document.getElementById('upload-icon').innerHTML = ic('upload', 26); // MOCK
  document.getElementById('upload-title').textContent = currentFileType === 'ilam' ? '전과목 성적 일람표 파일을 업로드하세요' : 'NEIS 교과학습발달상황 파일을 업로드하세요';
  document.getElementById('upload-hint').textContent = '클릭하거나 파일을 여기에 끌어다 놓으세요 · .xlsx .xls .xlsm .xlsb .ods 등';
  document.getElementById('file-info').style.display = 'none';
  document.getElementById('stu-sel').innerHTML = '<option value="">-- 파일을 먼저 업로드하세요 --</option>';
  document.getElementById('stu-badge').style.display = 'none';
  document.getElementById('stu-info').style.display = 'none';
  document.getElementById('subj-grid').innerHTML = '<div style="font-size:11px;color:var(--ink-3);padding:8px">학생을 먼저 선택해주세요.</div>';
  document.getElementById('career-inp').value = '';
  document.getElementById('memo-inp').value = '';
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('result-area').style.display = 'none';
  ['s1','s2','s3'].forEach(id => document.getElementById(id).classList.add('collapsed'));
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  document.getElementById('batch-count').textContent = '0명';
  mkResetAll(); uiRefresh(); // MOCK
  showToast('초기화했습니다.');
}

function showToast(m) { const t = document.getElementById('toast'); t.textContent = m; t.style.opacity = '1'; setTimeout(() => t.style.opacity = '0', 2800); }
function openGuide(){document.getElementById('guide-modal').classList.add('open');}
function closeGuide(){document.getElementById('guide-modal').classList.remove('open');}
function toggleDark() { document.body.classList.toggle('dark'); document.getElementById('dark-btn').textContent = document.body.classList.contains('dark') ? '☀️' : '\u0000'; }

let mobP = 'left';
function switchMob(p) {
  mobP = p;
  const lp = document.getElementById('lp');
  const rp = document.getElementById('rp');
  const ml = document.getElementById('mob-l');
  const mr = document.getElementById('mob-r');
  if (lp) lp.classList.toggle('mh', p !== 'left');
  if (rp) rp.classList.toggle('mh', p !== 'right');
  if (ml) ml.classList.toggle('active', p === 'left');
  if (mr) mr.classList.toggle('active', p === 'right');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════ ui/icons.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   라인 아이콘 (icons.js)
   ───────────────────────────────────────────────────────────────
   이모지 대신 쓰는 SVG 라인 아이콘. 전부 24×24 격자, 선 굵기 1.7,
   색은 currentColor를 따라가므로 글자색만 바꾸면 아이콘도 따라온다.

     ic('upload')            기본 크기(1em)
     ic('upload', 18)        픽셀 지정
     ic('upload', 18, 'x')   클래스 추가
   ═══════════════════════════════════════════════════════════════ */

const ICON_PATHS = {
  // ── 도구 정체성 ──
  lens:      '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L21 21"/>',
  lensChart: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L21 21"/><path d="M7.5 12.5l2-2.5 2 1.8 2.5-3.8"/>',

  // ── 자료 ──
  upload:    '<path d="M12 15.5V4"/><path d="M8 7.5L12 3.5l4 4"/><path d="M4 15v4.5a1 1 0 001 1h14a1 1 0 001-1V15"/>',
  download:  '<path d="M12 3.5V15"/><path d="M8 11l4 4 4-4"/><path d="M4 20.5h16"/>',
  file:      '<path d="M14 3.5H7.5a1 1 0 00-1 1v15a1 1 0 001 1h9a1 1 0 001-1V7z"/><path d="M13.6 3.5v4h4"/>',
  sheet:     '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M9.5 4.5v15"/>',
  pdf:       '<path d="M14 3.5H7.5a1 1 0 00-1 1v15a1 1 0 001 1h9a1 1 0 001-1V7z"/><path d="M13.6 3.5v4h4"/><path d="M9.5 17v-4h1.6a1.3 1.3 0 010 2.6H9.5"/>',
  paste:     '<rect x="5.5" y="5" width="13" height="15.5" rx="1.5"/><path d="M9.5 5V3.5h5V5"/><path d="M9 11h6M9 14.5h4"/>',
  pencil:    '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',

  // ── 분석 ──
  trend:     '<path d="M3.5 17l5-5.5 3.5 3L20 6"/><path d="M15 6h5v5"/>',
  radar:     '<path d="M12 3l8.5 6.2-3.2 10H6.7l-3.2-10z"/><path d="M12 8.2l4.3 3.2-1.7 5.2H9.4l-1.7-5.2z"/>',
  grid:      '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  scale:     '<path d="M12 4.5v16M8 20.5h8M5.5 8h13"/><path d="M5.5 8L2.8 13.8a2.8 2.8 0 005.4 0z"/><path d="M18.5 8l-2.7 5.8a2.8 2.8 0 005.4 0z"/>',
  target:    '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.6"/>',
  table:     '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  pulse:     '<path d="M3 12h4l2.5-6 4 12L16 12h5"/>',
  layers:    '<path d="M12 3.5L3.5 8l8.5 4.5L20.5 8z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 17L12 21.5l8.5-4.5"/>',

  // ── 사람 ──
  user:      '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20.5c0-3.7 3.2-5.7 7.2-5.7s7.2 2 7.2 5.7"/>',
  users:     '<circle cx="9.5" cy="8.2" r="3.4"/><path d="M2.8 20.5c0-3.5 3-5.4 6.7-5.4s6.7 1.9 6.7 5.4"/><path d="M16.5 5.2a3.4 3.4 0 010 6.3"/><path d="M18 14.9c2 .7 3.3 2.3 3.3 4.6"/>',

  // ── 동작 ──
  save:      '<path d="M5 4.5h11l3.5 3.5v11.5a1 1 0 01-1 1H5a1 1 0 01-1-1v-14a1 1 0 011-1z"/><path d="M8 4.5v5h7v-5M8 20.5v-6h8v6"/>',
  trash:     '<path d="M4 7h16"/><path d="M9.5 7V4.8h5V7"/><path d="M6 7l1 13.5h10L18 7"/><path d="M10 11v6M14 11v6"/>',
  refresh:   '<path d="M20.5 12a8.5 8.5 0 11-2.7-6.2"/><path d="M20.5 3.8v5h-5"/>',
  copy:      '<rect x="8.5" y="8.5" width="12" height="12" rx="1.5"/><path d="M15.5 8.5v-3a1 1 0 00-1-1h-10a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  print:     '<path d="M7 9.5V4h10v5.5"/><rect x="3.5" y="9.5" width="17" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  book:      '<path d="M4.5 4.5h6a2.2 2.2 0 012.2 2.2v13a2.2 2.2 0 00-2.2-2.2h-6z"/><path d="M19.5 4.5h-6a2.2 2.2 0 00-2.2 2.2v13a2.2 2.2 0 012.2-2.2h6z"/>',
  sliders:   '<path d="M3.5 7.5h9M16.5 7.5h4M3.5 16.5h3M10.5 16.5h10"/><circle cx="14.5" cy="7.5" r="2.2"/><circle cx="8.5" cy="16.5" r="2.2"/>',
  clipboard: '<rect x="5.5" y="5" width="13" height="15.5" rx="1.5"/><path d="M9.5 5V3.5h5V5"/><path d="M9 11h6M9 14.5h4"/>',
  panel:     '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M10 4.5v15"/>',
  external:  '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5L11 13"/><path d="M18 14v5.5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',

  // ── 상태 ──
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  moon:      '<path d="M20.5 14.3A8.7 8.7 0 019.7 3.5a8.7 8.7 0 1010.8 10.8z"/>',
  check:     '<path d="M4.5 12.5l4.8 4.8L19.5 7"/>',
  x:         '<path d="M6 6l12 12M18 6L6 18"/>',
  alert:     '<path d="M12 4.2l9 15.6a1 1 0 01-.9 1.5H3.9a1 1 0 01-.9-1.5z"/><path d="M12 10v4.3M12 17.8v.3"/>',
  info:      '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.8v.4"/>',
  dot:       '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',

  // ── 방향 ──
  chevDown:  '<path d="M6 9.5l6 6 6-6"/>',
  chevRight: '<path d="M9.5 6l6 6-6 6"/>',
  chevLeft:  '<path d="M14.5 6l-6 6 6 6"/>',
  arrowUp:   '<path d="M12 19.5V5M6.5 10.5L12 5l5.5 5.5"/>',
  arrowDown: '<path d="M12 4.5V19M6.5 13.5L12 19l5.5-5.5"/>',
  minus:     '<path d="M6 12h12"/>',
  plus:      '<path d="M12 6v12M6 12h12"/>',
  lock:      '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.8a4 4 0 018 0v2.7"/>',

  // 화면 톤 전환 — 해/달이 아니라 '종이 색'을 바꾸는 것이므로 명암 원으로 쓴다
  tone:      '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 000 16.8z" fill="currentColor" stroke="none"/>',
  // 게이지 바늘 — 유일하게 채워진 모양
  pin:       '<path d="M12 18L4 6h16z" fill="currentColor" stroke="none"/>'
};

/** 아이콘 하나를 SVG 문자열로 */
function ic(name, size, cls) {
  const d = ICON_PATHS[name];
  if (!d) return '';
  const s = size || 16;
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
}

/** 로고 — 렌즈 안에서 성적 곡선이 올라간다 */
function logoMark(size) {
  const s = size || 30;
  return '<svg class="logo-mark" width="' + s + '" height="' + s + '" viewBox="0 0 34 34" fill="none" aria-hidden="true">' +
    '<circle cx="14" cy="14" r="10.4" stroke="currentColor" stroke-width="2.1"/>' +
    '<path d="M21.6 21.6L30 30" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M9 16.6l3.2-3.9 2.7 2.4 3.6-5.3" stroke="currentColor" stroke-width="1.9" ' +
    'stroke-linecap="round" stroke-linejoin="round" opacity=".62"/>' +
    '</svg>';
}

/* ══════════════ ui/xlfont.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   엑셀 글꼴 통일 (xlfont.js)
   ───────────────────────────────────────────────────────────────
   이 앱이 내보내는 모든 엑셀(개인·일괄·모의고사·통합·상담 우선순위·예시 양식)을
   같은 글꼴로 맞춘다. 내보내는 곳이 여러 군데라 하나하나 고치지 않고 저장 직전에 한 번 칠한다.

     ExcelJS   Workbook을 감싸 xlsx.writeBuffer() 직전에 모든 셀 글꼴을 바꾼다.
               new ExcelJS.Workbook()을 부르는 모든 곳(본문 포함)이 자동으로 따라온다.
     SheetJS   무료판은 글꼴을 쓸 수 없어 xlWriteSheetJS()로 ExcelJS로 옮겨 저장한다.

   글꼴은 맑은 고딕 — Windows·Office 기본 한글 글꼴이라 어느 PC에서나 같게 보이고,
   지정하지 않으면 Calibri로 저장돼 한글이 대체 글꼴로 들쭉날쭉하게 나온다.
   9pt 이하는 화면에서 읽기 힘들어 10pt로 올린다(굵기·색은 그대로 둔다).
   ═══════════════════════════════════════════════════════════════ */

const XL_FONT = '맑은 고딕';
const XL_MIN_SIZE = 10;

/** 워크북의 모든 셀 글꼴을 XL_FONT로 (굵기·색·크기는 유지, 너무 작은 글자만 키운다) */
function xlUnifyFont(wb) {
  if (!wb || typeof wb.eachSheet !== 'function') return;
  wb.eachSheet(ws => {
    ws.eachRow({ includeEmpty: true }, row => {
      row.eachCell({ includeEmpty: true }, cell => {
        const f = Object.assign({}, cell.font || {});
        f.name = XL_FONT;
        f.family = 3;      // 고딕 계열
        f.charset = 129;   // 한글
        if (!(f.size >= XL_MIN_SIZE)) f.size = XL_MIN_SIZE;
        cell.font = f;
      });
    });
  });
}

// ExcelJS: 저장 직전에 칠하도록 Workbook을 감싼다 (한 번만)
(function () {
  if (typeof ExcelJS === 'undefined' || !ExcelJS.Workbook || ExcelJS.Workbook.__xlFont) return;
  const Base = ExcelJS.Workbook;
  class XlWorkbook extends Base {
    constructor() {
      super();
      const x = this.xlsx;
      if (x && typeof x.writeBuffer === 'function') {
        const orig = x.writeBuffer.bind(x);
        x.writeBuffer = (opt) => { try { xlUnifyFont(this); } catch (e) { console.error('[엑셀 글꼴]', e); } return orig(opt); };
      }
    }
  }
  XlWorkbook.__xlFont = true;
  try { ExcelJS.Workbook = XlWorkbook; }
  catch (e) { console.warn('[엑셀 글꼴] Workbook을 감싸지 못했습니다', e); }
})();

/**
 * SheetJS 워크북을 같은 글꼴로 저장한다 (XLSX.writeFile 대신).
 * 값·열 너비만 옮긴다 — 이 앱의 SheetJS 출력은 원래 서식이 없는 표다.
 */
function xlWriteSheetJS(sjWb, filename) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '고교 성적 나침반 5.0';
  sjWb.SheetNames.forEach(name => {
    const src = sjWb.Sheets[name];
    const ws = wb.addWorksheet(name);
    XLSX.utils.sheet_to_json(src, { header: 1, defval: null, raw: true, blankrows: true })
      .forEach(r => ws.addRow(r.map(v => (v === null ? undefined : v))));
    (src['!cols'] || []).forEach((c, i) => { if (c && c.wch) ws.getColumn(i + 1).width = c.wch + 2; });
  });
  return mkSaveWb(wb, filename);
}

/* ══════════════ 모의고사/mock-engine.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   모의고사 분석 엔진 (mock-engine.js)
   ───────────────────────────────────────────────────────────────
   성적 돋보기 — 전국연합학력평가 / 평가원 모의평가 / 수능 분석

   순수 함수만 모아둔 개발 원본. Node에서 단위 검증한 뒤
   index.html <script> 블록에 인라인 삽입해서 쓴다.
   (수정 시 반드시 양쪽 동기화 — README.md 참고)

   브라우저: window.MockEngine
   Node    : module.exports
   ═══════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  if (root) root.MockEngine = api;
  if (typeof window !== 'undefined') window.MockEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// ═══════════════════════════════════════════════
// 상수 — 평가 체계
// ═══════════════════════════════════════════════

// 영역 순서. 탐구는 슬롯(탐구1/탐구2)으로 두고 실제 과목명은 sel에 담는다.
const AREAS = ['국어', '수학', '영어', '한국사', '탐구1', '탐구2', '제2외국어'];

// 상대평가 영역 (표준점수·백분위가 나오는 영역)
const REL_AREAS = ['국어', '수학', '탐구1', '탐구2', '제2외국어'];
// 절대평가 영역
const ABS_AREAS = ['영어', '한국사'];

// 백분위 → 등급 커트 (상위 누적 %: 4/11/23/40/60/77/89/96)
// 백분위는 "나보다 낮은 점수를 받은 응시자 비율"이므로 상위 4% = 백분위 96
const PCT_CUTS = [96, 89, 77, 60, 40, 23, 11, 4];

// 전국 등급별 이론 인원 비율 (%) — 학급 분포 비교의 기준선
const NATIONAL_RATIO = [4, 7, 12, 17, 20, 17, 12, 7, 4];

// 절대평가 등급 커트 (원점수 기준, 1등급부터 8등급까지의 하한)
const ABS_CUTS = {
  '영어': [90, 80, 70, 60, 50, 40, 30, 20],   // 100점 만점
  '한국사': [40, 35, 30, 25, 20, 15, 10, 5]   // 50점 만점
};

// 회차 카탈로그 — 학년별 월 → 주관처
// 고3 4월/5월은 교육청별로 갈려서 둘 다 받아준다.
const EXAM_CATALOG = {
  1: { 3: '교육청', 6: '교육청', 9: '교육청', 11: '교육청' },
  2: { 3: '교육청', 6: '교육청', 9: '교육청', 11: '교육청' },
  3: { 3: '교육청', 4: '교육청', 5: '교육청', 6: '평가원', 7: '교육청', 9: '평가원', 10: '교육청', 11: '수능' }
};

const ORG_LABEL = {
  '교육청': '전국연합학력평가',
  '평가원': '수능 모의평가',
  '수능': '대학수학능력시험'
};

// 국어·수학 선택과목 (유불리 메모용)
const SELECT_SUBJECTS = {
  '국어': ['화법과작문', '언어와매체', '화작', '언매'],
  '수학': ['확률과통계', '미적분', '기하', '확통', '미적']
};

// ═══════════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════════

function _s(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function _norm(v) { return _s(v).replace(/\s/g, '').toLowerCase(); }

/** 숫자로 못 읽으면 null. '89점', '1,234', '-' 같은 값도 처리. */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const cleaned = _s(v).replace(/[,\s]/g, '').replace(/[점위등급%]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '—' || cleaned === '·') return null;
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

function avg(arr) {
  const v = arr.filter(x => typeof x === 'number' && isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** 최소제곱 기울기. x는 0,1,2… 순번. 양수면 값이 커지는 추세. */
function slope(values) {
  const pts = values.map((v, i) => [i, v]).filter(p => typeof p[1] === 'number' && isFinite(p[1]));
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let den = 0, nume = 0;
  for (const [x, y] of pts) { nume += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den === 0 ? null : nume / den;
}

function round(v, d) {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  const f = Math.pow(10, d || 0);
  return Math.round(v * f) / f;
}

// ═══════════════════════════════════════════════
// 등급 산출
// ═══════════════════════════════════════════════

/**
 * 백분위 → 9등급.
 * 파일에 등급이 있으면 그 값을 쓰고, 없을 때만 이 함수로 산출한다.
 * (실제 등급은 동점자 처리 때문에 커트와 어긋날 수 있어 원본 우선)
 */
function pctToMockGrade(pct) {
  const p = num(pct);
  if (p === null || p < 0 || p > 100) return null;
  for (let i = 0; i < PCT_CUTS.length; i++) if (p >= PCT_CUTS[i]) return i + 1;
  return 9;
}

/** 절대평가 원점수 → 등급. area는 '영어' 또는 '한국사'. */
function absScoreToGrade(raw, area) {
  const r = num(raw);
  const cuts = ABS_CUTS[area];
  if (r === null || !cuts) return null;
  for (let i = 0; i < cuts.length; i++) if (r >= cuts[i]) return i + 1;
  return 9;
}

/** 등급 → 해당 등급대의 백분위 중앙값. 백분위가 없는 영역을 축에 올릴 때 쓴다. */
function gradeToPctMid(grade) {
  const g = num(grade);
  if (g === null || g < 1 || g > 9) return null;
  const hi = g === 1 ? 100 : PCT_CUTS[g - 2];
  const lo = g === 9 ? 0 : PCT_CUTS[g - 1];
  return (hi + lo) / 2;
}

/**
 * 한 과목 항목의 빈 칸을 채운다.
 * 등급 없으면 백분위/원점수에서 산출, 백분위 없으면 등급 중앙값으로 보정.
 */
function fillSubject(area, item) {
  const out = Object.assign({}, item);
  out.raw = num(out.raw);
  out.std = num(out.std);
  out.pct = num(out.pct);
  out.grade = num(out.grade);
  out.sel = _s(out.sel) || null;
  out.abs = ABS_AREAS.indexOf(area) >= 0;

  if (out.grade === null) {
    out.grade = out.abs ? absScoreToGrade(out.raw, area) : pctToMockGrade(out.pct);
    if (out.grade !== null) out.gradeDerived = true;
  }
  if (out.pct === null && !out.abs && out.grade !== null) {
    out.pct = gradeToPctMid(out.grade);
    out.pctDerived = true;
  }
  return out;
}

// ═══════════════════════════════════════════════
// 회차
// ═══════════════════════════════════════════════

/** 회차 키: 'YYYY-MM' (정렬 가능) */
function examKey(year, month) {
  return String(year) + '-' + String(month).padStart(2, '0');
}

/** 회차 메타 생성. 학년별 카탈로그로 주관처를 정하고, 모르면 '교육청'으로 둔다. */
function makeExamMeta(year, month, gy) {
  const m = parseInt(month, 10);
  const org = (EXAM_CATALOG[gy] && EXAM_CATALOG[gy][m]) || (m === 11 && gy === 3 ? '수능' : '교육청');
  return {
    key: examKey(year, m),
    year: parseInt(year, 10),
    month: m,
    gy: gy || null,
    org: org,
    label: org === '수능' ? '수능' : m + '월 ' + (org === '평가원' ? '모의평가' : '학력평가'),
    fullLabel: year + '년 ' + m + '월 ' + ORG_LABEL[org]
  };
}

/** 회차 키 배열을 시간순 정렬 */
function sortExamKeys(keys) {
  return keys.slice().sort();
}

// 고1·2 공통 체제의 탐구 슬롯 이름
const INTEGRATED_TAMGU = { '탐구1': '통합사회', '탐구2': '통합과학' };

/**
 * 공통 체제 회차인지 — 국어·수학 선택과목이 없고 탐구는 통합사회·통합과학 두 과목 모두 응시한다.
 * 고1 학력평가는 원래 이 체제이고, 2025년 입학생(2022 개정 · 2028 수능)부터는 학년과 상관없이 그렇다.
 * 입학연도 = 시행연도 − 학년 + 1. 학년을 모르면 탐구 과목명으로 가린다.
 */
function isIntegratedExam(exam) {
  if (!exam) return false;
  const y = parseInt(exam.year, 10), gy = parseInt(exam.gy, 10);
  if (gy === 1) return true;
  if (y && gy && y - gy + 1 >= 2025) return true;
  const subj = exam.subjects || {};
  return Object.keys(INTEGRATED_TAMGU).some(a => subj[a] && /^통합(사회|과학)$/.test(_norm(subj[a].sel)));
}

/** 공통 체제 회차면 탐구 슬롯에 통합사회·통합과학 이름을 붙인다 ('사회탐구'·'과학' 같은 옛 표기도 바꾼다). */
function applyCurriculum(exam) {
  if (!exam || !exam.subjects || !isIntegratedExam(exam)) return exam;
  for (const [area, label] of Object.entries(INTEGRATED_TAMGU)) {
    const s = exam.subjects[area];
    if (s && (!s.sel || /^(사회|과학)(탐구)?$|^(통사|통과|사탐|과탐)$/.test(_norm(s.sel)))) s.sel = label;
  }
  return exam;
}

/** 탐구 슬롯 표시명. 공통 체제면 '통합사회'·'통합과학', 아니면 '탐구1'·'탐구2' 그대로. */
function areaLabel(area, exam) {
  return (INTEGRATED_TAMGU[area] && isIntegratedExam(exam)) ? INTEGRATED_TAMGU[area] : area;
}

// ═══════════════════════════════════════════════
// 파서 — 공통 헤더 감지
// ═══════════════════════════════════════════════

const ID_ALIASES = {
  uid:  ['학번', '학생번호', '고유번호', 'uid', '개인번호'],
  cls:  ['반', '학급', '반명'],
  num:  ['번호', '번', '출석번호', '연번', 'no'],
  name: ['이름', '성명', '학생명', '학생', '성명(한글)'],
  gy:   ['학년'],
  exam: ['시험', '회차', '시험명', '차수', '월']
};

const METRIC_ALIASES = {
  raw:   ['원점수', '원점', '점수', 'raw'],
  std:   ['표준점수', '표점', '표준', 'std'],
  pct:   ['백분위', '백분', 'pct', '%'],
  grade: ['등급', '석차등급', 'grade'],
  // 선택과목명 (국어 화작/언매, 수학 확통/미적/기하, 탐구 실제 과목명)
  sel:   ['선택과목', '선택', '과목명', '응시과목', '선택과목명']
};

/** 영역명 정규화. '탐구1'/'탐1'/'사탐1' → '탐구1', 실제 과목명이면 null. */
function normalizeArea(v) {
  const n = _norm(v);
  if (!n) return null;
  if (n === '국어' || n === '국') return '국어';
  if (n === '수학' || n === '수') return '수학';
  if (n === '영어' || n === '영') return '영어';
  if (n === '한국사' || n === '한사') return '한국사';
  if (n === '제2외국어' || n === '제2외' || n === '제2외국어/한문') return '제2외국어';
  let m = n.match(/^(탐구|탐|사회탐구|과학탐구|사탐|과탐|직탐)\s*([12])$/);
  if (m) return '탐구' + m[2];
  if (n === '탐구' || n === '탐') return '탐구1';
  // 고1·2 학력평가는 탐구가 사회·과학 한 과목씩이다 → 탐구1/탐구2 슬롯에 고정 배치
  if (n === '사회탐구' || n === '사탐' || n === '사회' || n === '통합사회' || n === '통사') return '탐구1';
  if (n === '과학탐구' || n === '과탐' || n === '과학' || n === '통합과학' || n === '통과') return '탐구2';
  if (n === '직업탐구' || n === '직탐') return '탐구1';
  return null;
}

function matchMetric(v) {
  const n = _norm(v);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(METRIC_ALIASES)) {
    if (aliases.some(a => n === _norm(a))) return key;
  }
  return null;
}

/** '국어원점수' 처럼 한 칸에 영역+지표가 붙어있는 경우 분리 */
function splitAreaMetric(v) {
  const n = _norm(v);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(METRIC_ALIASES)) {
    for (const a of aliases) {
      const an = _norm(a);
      if (n.length > an.length && n.endsWith(an)) {
        const area = normalizeArea(n.slice(0, n.length - an.length));
        if (area) return { area: area, metric: key };
      }
    }
  }
  return null;
}

function matchId(v) {
  const n = _norm(v);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(ID_ALIASES)) {
    if (aliases.some(a => n === _norm(a))) return key;
  }
  return null;
}

/** 병합셀로 비어버린 칸을 앞 값으로 채운다 (2행 헤더의 1행용) */
function forwardFill(row) {
  const out = [];
  let last = '';
  for (let i = 0; i < row.length; i++) {
    const v = _s(row[i]);
    if (v) last = v;
    out[i] = last;
  }
  return out;
}

/**
 * 헤더를 찾아 컬럼 매핑을 만든다.
 * 1행 헤더('국어원점수')와 2행 헤더(병합된 과목명 + 지표명) 둘 다 지원.
 * @returns {{headerRow, dataStart, id:{}, cols:[{area,metric,c}]} | null}
 */
function detectMockHeader(rows) {
  const limit = Math.min(50, rows.length);

  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!row) continue;

    // ── 1행 헤더 시도 ──
    const single = [];
    const id1 = {};
    for (let c = 0; c < row.length; c++) {
      const hit = splitAreaMetric(row[c]);
      if (hit) { single.push({ area: hit.area, metric: hit.metric, c: c }); continue; }
      const idKey = matchId(row[c]);
      if (idKey && id1[idKey] === undefined) id1[idKey] = c;
    }
    if (single.length >= 2 && (id1.name !== undefined || id1.uid !== undefined)) {
      return { headerRow: i, dataStart: i + 1, id: id1, cols: single, mode: 'single' };
    }

    // ── 2행 헤더 시도 (i=과목명 병합행, i+1=지표행) ──
    const next = rows[i + 1];
    if (!next) continue;
    const filled = forwardFill(row);
    const pairs = [];
    for (let c = 0; c < Math.max(filled.length, next.length); c++) {
      const area = normalizeArea(filled[c]);
      const metric = matchMetric(next[c]);
      if (area && metric) pairs.push({ area: area, metric: metric, c: c });
    }
    if (pairs.length >= 2) {
      // 식별 컬럼은 두 행 어디에 있어도 잡는다
      const id2 = {};
      for (let c = 0; c < Math.max(row.length, next.length); c++) {
        const k = matchId(row[c]) || matchId(next[c]);
        if (k && id2[k] === undefined) id2[k] = c;
      }
      if (id2.name !== undefined || id2.uid !== undefined) {
        return { headerRow: i, dataStart: i + 2, id: id2, cols: pairs, mode: 'double' };
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// 파서 — ① 표준 wide 엑셀 / ② 붙여넣기
// ═══════════════════════════════════════════════

/**
 * 2차원 배열(rows) → mockStudents 구조.
 * @param rows      XLSX.utils.sheet_to_json(ws, {header:1}) 결과
 * @param examMeta  makeExamMeta() 결과. 파일에 회차 컬럼이 있으면 행별로 덮어쓴다.
 * @param manualMap detectMockHeader 결과를 수동으로 넘길 때
 */
function parseMockWide(rows, examMeta, manualMap) {
  const map = manualMap || detectMockHeader(rows);
  if (!map) return { students: {}, map: null, error: '헤더를 찾지 못했습니다' };

  const students = {};
  let rowCount = 0;

  for (let i = map.dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const name = map.id.name !== undefined ? _s(row[map.id.name]) : '';
    const uid = map.id.uid !== undefined ? _s(row[map.id.uid]) : '';
    if (!name && !uid) continue;
    // 헤더 반복행·합계행 스킵
    if (matchId(name) || /^(합계|평균|계|소계|전체)$/.test(_norm(name))) continue;
    if (name && !/^[가-힣A-Za-z][가-힣A-Za-z\s·*]{0,15}$/.test(name)) continue;

    // 전교 단위 파일에는 동명이인이 있다. 파싱 단계에서는 반·번호로 고유하게 잡아두고,
    // 실제로 불러올 때(mkCommitPending) 이름 키로 바꾼다.
    const cls = map.id.cls !== undefined ? _s(row[map.id.cls]) : '';
    const numv = map.id.num !== undefined ? _s(row[map.id.num]) : '';
    const key = uid || ((cls && numv) ? cls + '-' + numv + '-' + name : name);

    // 회차: 행에 시험/월 컬럼이 있으면 그걸 우선
    let meta = examMeta;
    if (map.id.exam !== undefined) {
      const rowMeta = parseExamCell(row[map.id.exam], examMeta);
      if (rowMeta) meta = rowMeta;
    }
    if (!meta) continue;

    // 과목 값 수집
    const subjects = {};
    for (const col of map.cols) {
      const v = row[col.c];
      if (v === null || v === undefined || _s(v) === '') continue;
      if (!subjects[col.area]) subjects[col.area] = {};
      subjects[col.area][col.metric] = v;
    }
    // 값이 하나도 없는 행은 건너뛴다
    const filled = {};
    let any = false;
    for (const [area, item] of Object.entries(subjects)) {
      const f = fillSubject(area, item);
      if (f.grade === null && f.pct === null && f.raw === null) continue;
      filled[area] = f;
      any = true;
    }
    if (!any) continue;

    if (!students[key]) {
      students[key] = {
        meta: {
          name: name || key,
          uid: uid || null,
          cls: cls || null,
          num: numv === '' ? null : num(numv)
        },
        exams: {}
      };
    }
    // 같은 회차가 이미 있으면 병합 (파일이 과목별로 쪼개진 경우)
    const ex = students[key].exams[meta.key];
    if (ex) Object.assign(ex.subjects, filled);
    else students[key].exams[meta.key] = Object.assign({}, meta, { subjects: filled });

    rowCount++;
  }

  return { students: students, map: map, rowCount: rowCount };
}

/**
 * '2026년 6월', '6월 모평', '2026-06', '2026 9월 고1 전국연합 통계자료.xlsx' 등에서 회차를 읽는다.
 * 시트명·파일명 어디에 써도 되도록 학년('고1')과 주관처 표기까지 흡수한다.
 */
function parseExamCell(v, fallback) {
  const s = _s(v);
  if (!s) return null;
  const year = (s.match(/(20\d{2})/) || [])[1] || (fallback && fallback.year) || new Date().getFullYear();
  const month = (s.match(/(\d{1,2})\s*월/) || [])[1] || (s.match(/^\d{4}[-.\/](\d{1,2})/) || [])[1];
  if (!month) return null;

  // '고1' / '1학년' 표기가 있으면 학년을 따른다
  let gy = (fallback && fallback.gy) || 3;
  const mg = s.match(/고\s*([1-3])/) || s.match(/([1-3])\s*학년/);
  if (mg) gy = parseInt(mg[1], 10);

  const meta = makeExamMeta(year, month, gy);
  const t = s.replace(/\s/g, '');
  if (/수능/.test(t) && !/모의/.test(t)) { meta.org = '수능'; meta.label = '수능'; }
  else if (/모의평가|모평/.test(t)) { meta.org = '평가원'; meta.label = meta.month + '월 모의평가'; }
  else if (/전국연합|학력평가|학평/.test(t)) { meta.org = '교육청'; meta.label = meta.month + '월 학력평가'; }
  meta.fullLabel = meta.year + '년 ' + meta.month + '월 ' + (ORG_LABEL[meta.org] || meta.org);
  return meta;
}

/** 붙여넣은 표 텍스트 → 2차원 배열. 탭 우선, 없으면 2칸 이상 공백. */
function textToRows(text) {
  const lines = _s(text).split(/\r?\n/).filter(l => l.trim() !== '');
  const useTab = lines.some(l => l.indexOf('\t') >= 0);
  return lines.map(l => (useTab ? l.split('\t') : l.trim().split(/\s{2,}|\s*\|\s*/)).map(c => c.trim()));
}

/** ② 붙여넣기 경로 */
function parseMockPaste(text, examMeta) {
  return parseMockWide(textToRows(text), examMeta);
}

// ═══════════════════════════════════════════════
// 집계 — 개인
// ═══════════════════════════════════════════════

/** 반영 과목 집합의 평균등급. 탐구 2과목은 평균내서 1개로 칠 수도 있다. */
function mockMainAvg(exam, weightSet, mergeTamgu) {
  if (!exam || !exam.subjects) return null;
  const want = weightSet instanceof Set ? weightSet : new Set(weightSet || ['국어', '수학', '영어', '탐구1', '탐구2']);
  const vals = [];
  const tamgu = [];

  for (const area of AREAS) {
    if (!want.has(area)) continue;
    const s = exam.subjects[area];
    if (!s || s.grade === null || s.grade === undefined) continue;
    if (mergeTamgu && (area === '탐구1' || area === '탐구2')) tamgu.push(s.grade);
    else vals.push(s.grade);
  }
  if (mergeTamgu && tamgu.length) vals.push(avg(tamgu));
  return vals.length ? round(avg(vals), 2) : null;
}

/** 국·수·영·탐 백분위 평균 (정시 라인 추정용). 영어는 등급→백분위 중앙값으로 환산. */
function mainPctAvg(exam) {
  if (!exam || !exam.subjects) return null;
  const vals = [];
  for (const area of ['국어', '수학', '영어', '탐구1', '탐구2']) {
    const s = exam.subjects[area];
    if (!s) continue;
    const p = s.pct !== null && s.pct !== undefined ? s.pct : gradeToPctMid(s.grade);
    if (p !== null) vals.push(p);
  }
  return vals.length >= 3 ? round(avg(vals), 1) : null;
}

/** 한 학생의 회차별 시계열. [{key, meta, subjects, mainAvg, pctAvg}] */
function examSeries(stu, weightSet, mergeTamgu) {
  if (!stu || !stu.exams) return [];
  return sortExamKeys(Object.keys(stu.exams)).map(k => {
    const ex = stu.exams[k];
    return Object.assign({}, ex, {
      mainAvg: mockMainAvg(ex, weightSet, mergeTamgu),
      pctAvg: mainPctAvg(ex)
    });
  });
}

/** 직전 회차 대비 델타. 등급은 낮을수록 좋으므로 improved = delta < 0 */
function examDelta(series) {
  return series.map((ex, i) => {
    if (i === 0) return Object.assign({}, ex, { delta: null, subjDelta: {} });
    const prev = series[i - 1];
    const subjDelta = {};
    for (const area of AREAS) {
      const cur = ex.subjects[area], pv = prev.subjects[area];
      if (cur && pv && cur.grade !== null && pv.grade !== null) {
        subjDelta[area] = { grade: cur.grade - pv.grade, pct: (cur.pct !== null && pv.pct !== null) ? round(cur.pct - pv.pct, 1) : null };
      }
    }
    const delta = (ex.mainAvg !== null && prev.mainAvg !== null) ? round(ex.mainAvg - prev.mainAvg, 2) : null;
    return Object.assign({}, ex, { delta: delta, subjDelta: subjDelta, prevKey: prev.key });
  });
}

/**
 * 영역별 강·약 진단.
 * 본인 영역 백분위의 편차로 상대적 강점/약점을 잡고, 선택과목·탐구 조합 메모를 붙인다.
 */
function diagnoseSubjects(stu, opts) {
  const series = examSeries(stu, opts && opts.weightSet, opts && opts.mergeTamgu);
  if (!series.length) return { items: [], notes: [] };
  const recent = series[series.length - 1];

  // 영역별 최근값 + 추세
  const items = [];
  for (const area of AREAS) {
    const cur = recent.subjects[area];
    if (!cur) continue;
    const hist = series.map(e => e.subjects[area] ? e.subjects[area].grade : null);
    const pctHist = series.map(e => e.subjects[area] ? e.subjects[area].pct : null);
    const valid = hist.filter(v => v !== null);
    items.push({
      area: area,
      name: cur.sel || cur.name || areaLabel(area, recent),
      grade: cur.grade,
      pct: cur.pct,
      raw: cur.raw,
      std: cur.std,
      abs: cur.abs,
      best: valid.length ? Math.min.apply(null, valid) : null,
      worst: valid.length ? Math.max.apply(null, valid) : null,
      trend: round(slope(hist), 2),          // 음수 = 등급이 좋아지는 중
      pctTrend: round(slope(pctHist), 1),    // 양수 = 백분위가 오르는 중
      history: hist
    });
  }

  // 상대 강약: 본인 평균 대비 ±0.7등급
  const gs = items.map(i => i.grade).filter(g => g !== null);
  const mean = avg(gs);
  for (const it of items) {
    if (it.grade === null || mean === null) { it.tag = null; continue; }
    const d = it.grade - mean;
    it.gapFromSelf = round(d, 2);
    it.tag = d <= -0.7 ? 'strong' : (d >= 0.7 ? 'weak' : 'even');
  }

  // 메모
  const notes = [];
  const weak = items.filter(i => i.tag === 'weak').sort((a, b) => b.grade - a.grade);
  const strong = items.filter(i => i.tag === 'strong').sort((a, b) => a.grade - b.grade);
  if (strong.length) notes.push('강점 영역: ' + strong.map(i => i.name + '(' + i.grade + '등급)').join(', '));
  if (weak.length) notes.push('약점 영역: ' + weak.map(i => i.name + '(' + i.grade + '등급)').join(', '));

  // 탐구 조합 균형
  const t1 = recent.subjects['탐구1'], t2 = recent.subjects['탐구2'];
  if (t1 && t2 && t1.grade !== null && t2.grade !== null) {
    const gap = Math.abs(t1.grade - t2.grade);
    if (gap >= 2) {
      const lo = t1.grade > t2.grade ? t1 : t2;
      const loName = lo.sel || lo.name || areaLabel(t1.grade > t2.grade ? '탐구1' : '탐구2', recent);
      // 공통 체제는 통합사회·통합과학을 모두 응시하므로 바꿀 과목이 없다
      if (isIntegratedExam(recent)) notes.push('통합사회·통합과학 격차가 ' + gap + '등급입니다. 두 과목 모두 응시하므로 ' + loName + ' 보완을 우선하세요.');
      else notes.push('탐구 두 과목 격차가 ' + gap + '등급입니다. ' + loName + ' 과목 교체 또는 집중 보완을 검토하세요.');
    }
  }

  // 절대평가 영어 경고
  const eng = recent.subjects['영어'];
  if (eng && eng.raw !== null && eng.grade !== null && eng.grade <= 3) {
    const cut = ABS_CUTS['영어'][eng.grade - 2];
    if (cut && cut - eng.raw <= 5 && eng.grade >= 2) {
      notes.push('영어는 절대평가라 ' + (cut - eng.raw) + '점만 더 올리면 ' + (eng.grade - 1) + '등급입니다. 투입 대비 효율이 가장 좋습니다.');
    }
  }

  // 선택과목 표기 (공통 체제는 국어·수학 선택과목이 없다)
  if (!isIntegratedExam(recent)) for (const area of ['국어', '수학']) {
    const s = recent.subjects[area];
    if (s && s.sel) notes.push(area + ' 선택과목: ' + s.sel);
  }

  return { items: items, notes: notes, recent: recent, series: series };
}

// ═══════════════════════════════════════════════
// 수시 / 정시 판정
// ═══════════════════════════════════════════════

const TRACK = {
  SUSI: { key: 'susi', label: '수시 우위형', color: '#0a7550', icon: 'file' },
  JEONGSI: { key: 'jeongsi', label: '정시 우위형', color: '#6b4bb0', icon: 'trend' },
  BALANCE: { key: 'balance', label: '균형형', color: '#9a5b08', icon: 'scale' }
};

const TRACK_THRESHOLD = 0.75;

/**
 * 내신 9등급 환산 평균과 모의 주요과목 평균등급을 비교해 성향을 판정한다.
 * @param naesin9  내신 평균 (9등급 축). 호출부에서 calcDecimalGrade9Equiv로 만들어 넘긴다.
 * @param stu      mockStudents[name]
 * @param opts     { weightSet, mergeTamgu, naesinTrend }
 */
function judgeTrack(naesin9, stu, opts) {
  opts = opts || {};
  const series = examDelta(examSeries(stu, opts.weightSet, opts.mergeTamgu));
  const recent = series.length ? series[series.length - 1] : null;
  const mockAvg = recent ? recent.mainAvg : null;

  const result = {
    naesin9: naesin9 !== null && naesin9 !== undefined ? round(naesin9, 2) : null,
    mockAvg: mockAvg,
    delta: null,
    track: null,
    reasons: [],
    series: series
  };

  if (result.naesin9 === null || mockAvg === null) {
    result.incomplete = true;
    result.reasons.push(result.naesin9 === null
      ? '내신 데이터가 없어 성향 판정을 할 수 없습니다. 내신 파일을 함께 올려주세요.'
      : '모의고사 데이터가 없어 성향 판정을 할 수 없습니다.');
    return result;
  }

  // Δ > 0 : 내신 등급 숫자가 모의보다 크다 = 모의가 더 좋다 = 정시 우위
  const delta = round(result.naesin9 - mockAvg, 2);
  result.delta = delta;

  if (delta >= TRACK_THRESHOLD) result.track = TRACK.JEONGSI;
  else if (delta <= -TRACK_THRESHOLD) result.track = TRACK.SUSI;
  else result.track = TRACK.BALANCE;

  // ── 근거 문장 ──
  const absD = Math.abs(delta).toFixed(2);
  const nFix = result.naesin9.toFixed(2), mFix = mockAvg.toFixed(2);
  if (result.track === TRACK.JEONGSI) {
    result.reasons.push('모의고사 평균이 내신보다 ' + absD + '등급 앞섭니다 (내신 ' + result.naesin9 + ' vs 모의 ' + mockAvg + ', 9등급 기준).');
    result.reasons.push('수능 경쟁력이 교과 성적보다 높아 정시 지원 비중을 키우는 편이 유리합니다.');
  } else if (result.track === TRACK.SUSI) {
    result.reasons.push('내신이 모의고사보다 ' + absD + '등급 앞섭니다 (내신 ' + result.naesin9 + ' vs 모의 ' + mockAvg + ', 9등급 기준).');
    result.reasons.push('교과·학종 등 수시 전형이 유리합니다. 다만 수능 최저학력기준 충족 여부를 반드시 확인해야 합니다.');
  } else {
    result.reasons.push('내신 ' + nFix + ', 모의 ' + mFix + '로 격차가 ' + absD + '등급에 그칩니다 (9등급 기준).');
    result.reasons.push('어느 한쪽으로 몰기 어렵습니다. 수시 6장에 소신·적정을 섞고 정시도 함께 준비하는 병행 전략이 맞습니다.');
  }

  // 추세 보강
  const mockTrend = slope(series.map(e => e.mainAvg));
  if (mockTrend !== null && Math.abs(mockTrend) >= 0.15) {
    result.mockTrend = round(mockTrend, 2);
    result.reasons.push(mockTrend < 0
      ? '모의고사가 회차를 거듭할수록 좋아지는 추세입니다 (회차당 약 ' + Math.abs(mockTrend).toFixed(2) + '등급 상승). 정시 가능성을 더 열어둘 만합니다.'
      : '모의고사가 회차를 거듭할수록 나빠지는 추세입니다 (회차당 약 ' + mockTrend.toFixed(2) + '등급 하락). 학습 방법 점검이 필요합니다.');
  }
  if (opts.naesinTrend !== null && opts.naesinTrend !== undefined && Math.abs(opts.naesinTrend) >= 0.15) {
    result.naesinTrend = round(opts.naesinTrend, 2);
    result.reasons.push(opts.naesinTrend < 0
      ? '내신도 학기가 갈수록 오르고 있어 학생부 상승 곡선을 근거로 쓸 수 있습니다.'
      : '내신이 학기가 갈수록 떨어지고 있어 수시 지원 시 하락 추세에 대한 설명이 필요합니다.');
  }

  // 수능 최저 충족 가늠 (주요 3개 영역 등급 합)
  if (recent) {
    const sum = best3Sum(recent);
    if (sum !== null) {
      result.best3Sum = sum;
      if (sum <= 6) result.reasons.push('상위 3개 영역 등급 합이 ' + sum + '입니다. 주요 대학 수능 최저(합 6~7) 충족이 유력합니다.');
      else if (sum <= 9) result.reasons.push('상위 3개 영역 등급 합이 ' + sum + '입니다. 중위권 대학 수능 최저(합 8~9) 선에 있어 한 등급 개선이 관건입니다.');
      else result.reasons.push('상위 3개 영역 등급 합이 ' + sum + '입니다. 수능 최저가 없는 전형 위주로 수시를 설계하는 편이 안전합니다.');
    }
  }

  return result;
}

// ═══════════════════════════════════════════════
// 정시 라인 추정
// ═══════════════════════════════════════════════

/**
 * 기본 기준표. 국·수·영·탐 백분위 평균 → 대학군.
 * 어디가(adiga.kr)에 공개 API가 없어 자동 갱신이 불가능하므로,
 * 매년 실제 입결을 확인해 univ-lines.json을 덮어쓰는 것을 전제로 한 개략치다.
 * minPct는 해당 대학군의 하한 (전년도 정시 최종등록자 70%컷 평균 백분위 기준).
 */
const DEFAULT_UNIV_LINES = {
  updated: '2026-09',
  verified: false,            // 사용자가 실제 입결로 갱신하면 true 로 바꿔 쓴다
  source: '공식 자료가 아닌 개략 추정치입니다. 어디가(adiga.kr)에서 확인한 값으로 바꿔 쓰세요.',
  lines: [
    { minPct: 98.0, group: '의약계열 · 최상위권', example: '의예/치의예/약학, 서울대 주요학과' },
    { minPct: 95.5, group: '최상위권', example: '서울대 · 연세대 · 고려대 상위학과' },
    { minPct: 92.0, group: '상위권', example: '서강대 · 성균관대 · 한양대 · 중앙대 상위학과' },
    { minPct: 88.0, group: '수도권 상위', example: '경희대 · 한국외대 · 서울시립대 · 건국대' },
    { minPct: 82.0, group: '수도권 중상위', example: '동국대 · 홍익대 · 숙명여대 · 국민대 · 지방거점국립대 상위' },
    { minPct: 74.0, group: '수도권 중위 · 지방국립', example: '광운대 · 명지대 · 상명대 · 지방거점국립대' },
    { minPct: 62.0, group: '수도권 외곽 · 지방 상위', example: '가천대 · 한성대 · 지방 주요 사립대' },
    { minPct: 45.0, group: '지방 중위', example: '지방 사립대 일반학과' },
    { minPct: 0.0, group: '지방 · 전문대', example: '지방 사립대 · 전문대학' }
  ]
};

/**
 * 백분위 평균 → 대학군 라인.
 * @param exam   회차 객체
 * @param table  { lines: [...] } 형태. 없으면 기본 기준표.
 */
function estimateJeongsiLine(exam, table) {
  const pct = mainPctAvg(exam);
  if (pct === null) return null;
  const t = (table && table.lines) ? table : DEFAULT_UNIV_LINES;
  const lines = t.lines.slice().sort((a, b) => b.minPct - a.minPct);

  let idx = lines.length - 1;
  for (let i = 0; i < lines.length; i++) {
    if (pct >= lines[i].minPct) { idx = i; break; }
  }
  return {
    pctAvg: pct,
    line: lines[idx],
    upper: idx > 0 ? lines[idx - 1] : null,
    gapToUpper: idx > 0 ? round(lines[idx - 1].minPct - pct, 1) : null,
    updated: t.updated,
    source: t.source,
    verified: t.verified !== false,
    disclaimer: '참고용 추정치입니다. 대학별 반영비율·변환표준점수·가산점이 반영되지 않아 실제 지원 가능 대학과 다를 수 있습니다.'
  };
}

// ═══════════════════════════════════════════════
// 집계 — 학급
// ═══════════════════════════════════════════════

/**
 * 한 회차의 학급 통계.
 * @returns { count, bySubject: { 국어: {avg, dist[9], top2Ratio, ...} }, ... }
 */
function classMockStats(mockStudents, key, opts) {
  opts = opts || {};
  const bySubject = {};
  let count = 0;

  for (const stu of Object.values(mockStudents)) {
    const ex = stu.exams && stu.exams[key];
    if (!ex) continue;
    count++;
    for (const area of AREAS) {
      const s = ex.subjects[area];
      if (!s || s.grade === null) continue;
      const b = bySubject[area] || (bySubject[area] = { grades: [], dist: new Array(9).fill(0) });
      b.grades.push(s.grade);
      b.dist[Math.min(9, Math.max(1, Math.round(s.grade))) - 1]++;
    }
  }

  for (const [area, b] of Object.entries(bySubject)) {
    const n = b.grades.length;
    b.n = n;
    b.avg = round(avg(b.grades), 2);
    b.top2 = b.dist[0] + b.dist[1];
    b.top2Ratio = n ? round(b.top2 * 100 / n, 1) : null;
    b.top3Ratio = n ? round((b.top2 + b.dist[2]) * 100 / n, 1) : null;
    b.ratio = b.dist.map(c => n ? round(c * 100 / n, 1) : 0);
    // 전국 대비 상위(1~2등급) 집중도. 1.0 = 전국 평균 수준
    const natTop2 = NATIONAL_RATIO[0] + NATIONAL_RATIO[1]; // 11%
    b.concentration = (n && b.top2Ratio !== null) ? round(b.top2Ratio / natTop2, 2) : null;
    b.deviation = b.ratio.map((r, i) => round(r - NATIONAL_RATIO[i], 1));
    delete b.grades;
  }

  return { key: key, count: count, bySubject: bySubject, national: NATIONAL_RATIO.slice() };
}

/**
 * 직전 회차 대비 급락/급상승 학생.
 * @param threshold 총등급합 변동 임계값 (기본 3). |합 변동| >= threshold 인 학생만.
 */
function findMovers(mockStudents, curKey, prevKey, threshold, weightSet) {
  const th = threshold || 3;
  const want = weightSet instanceof Set ? weightSet : new Set(weightSet || ['국어', '수학', '영어', '탐구1', '탐구2']);
  const up = [], down = [];

  for (const [name, stu] of Object.entries(mockStudents)) {
    const cur = stu.exams && stu.exams[curKey];
    const prev = stu.exams && stu.exams[prevKey];
    if (!cur || !prev) continue;

    // 양쪽 모두 등급이 있는 영역만 비교 (과목 수가 다르면 합계가 왜곡됨)
    let sum = 0, n = 0;
    const detail = [];
    for (const area of AREAS) {
      if (!want.has(area)) continue;
      const c = cur.subjects[area], p = prev.subjects[area];
      if (!c || !p || c.grade === null || p.grade === null) continue;
      const d = c.grade - p.grade;
      sum += d; n++;
      if (d !== 0) detail.push({ area: area, delta: d, from: p.grade, to: c.grade });
    }
    if (!n) continue;

    // 등급은 낮을수록 좋으므로 합이 음수면 상승
    const item = {
      name: name,
      cls: stu.meta && stu.meta.cls,
      num: stu.meta && stu.meta.num,
      sumDelta: sum,
      areaCount: n,
      detail: detail.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    };
    if (sum <= -th) up.push(item);
    else if (sum >= th) down.push(item);
  }

  up.sort((a, b) => a.sumDelta - b.sumDelta);
  down.sort((a, b) => b.sumDelta - a.sumDelta);
  return { up: up, down: down, threshold: th, curKey: curKey, prevKey: prevKey };
}

/**
 * 회차별 등급 인원 히트맵 데이터.
 * @returns { areas, keys, cells: { '국어': { '2026-03': {counts[9], ratios[9], delta[9]} } } }
 */
function buildHeatmap(mockStudents, keys, areas) {
  const ks = sortExamKeys(keys);
  const as = areas || ['국어', '수학', '영어', '탐구1', '탐구2'];
  const cells = {};

  for (const area of as) {
    cells[area] = {};
    let prev = null;
    for (const k of ks) {
      const counts = new Array(9).fill(0);
      let n = 0;
      for (const stu of Object.values(mockStudents)) {
        const ex = stu.exams && stu.exams[k];
        const s = ex && ex.subjects[area];
        if (!s || s.grade === null) continue;
        counts[Math.min(9, Math.max(1, Math.round(s.grade))) - 1]++;
        n++;
      }
      const ratios = counts.map(c => n ? round(c * 100 / n, 1) : 0);
      const delta = prev ? counts.map((c, i) => c - prev[i]) : new Array(9).fill(null);
      cells[area][k] = { counts: counts, ratios: ratios, delta: delta, n: n };
      prev = counts;
    }
  }
  return { areas: as, keys: ks, cells: cells };
}

/** mockStudents 전체에서 등장한 회차 키 (시간순) */
function allExamKeys(mockStudents) {
  const set = new Set();
  for (const stu of Object.values(mockStudents)) {
    for (const k of Object.keys(stu.exams || {})) set.add(k);
  }
  return sortExamKeys([...set]);
}

/** 회차 키 → 메타 (아무 학생에게서나 하나 꺼내온다) */
function examMetaOf(mockStudents, key) {
  for (const stu of Object.values(mockStudents)) {
    if (stu.exams && stu.exams[key]) {
      const e = stu.exams[key];
      return { key: e.key, year: e.year, month: e.month, gy: e.gy, org: e.org, label: e.label, fullLabel: e.fullLabel };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// export
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// 수능 최저 충족 시뮬레이터
// ═══════════════════════════════════════════════

/** 국·수·영·탐 중 좋은 3개 영역 등급 합. 탐구는 두 과목 중 좋은 쪽 1과목. 영역이 3개 미만이면 null. */
function best3Sum(exam) {
  const r = csatMinCheck(exam, 3, 27);
  return r ? r.sum : null;
}

/**
 * "국·수·영·탐 중 k개 영역 등급 합 target 이내"를 채우는지, 못 채우면 가장 적게 올리는 길을 찾는다.
 * 탐구는 대학 다수가 쓰는 방식대로 두 과목 중 좋은 쪽 1과목을 기본으로 하고,
 * opts.tamguAvg면 두 과목 평균(소수점 버림)을 쓴다.
 * @returns { ok, sum, used:[{area,grade}], short, paths:[[{area,from,to}]] } 또는 null(영역 부족)
 */
function csatMinCheck(exam, k, target, opts) {
  opts = opts || {};
  if (!exam || !exam.subjects) return null;
  const g = a => { const s = exam.subjects[a]; return s && typeof s.grade === 'number' ? s.grade : null; };
  const pool = [];
  ['국어', '수학', '영어'].forEach(a => { if (g(a) !== null) pool.push({ area: a, grade: g(a) }); });
  const t1 = g('탐구1'), t2 = g('탐구2');
  if (t1 !== null || t2 !== null) {
    let tg;
    if (t1 !== null && t2 !== null) tg = opts.tamguAvg ? Math.floor((t1 + t2) / 2) : Math.min(t1, t2);
    else tg = t1 !== null ? t1 : t2;
    pool.push({ area: '탐구', grade: tg });
  }
  if (pool.length < k) return null;

  const bestK = grades => grades.slice().sort((a, b) => a - b).slice(0, k).reduce((s, v) => s + v, 0);
  const cur = pool.map(p => p.grade);
  const sum = bestK(cur);
  const used = pool.slice().sort((a, b) => a.grade - b.grade).slice(0, k);
  if (sum <= target) return { ok: true, sum: sum, spare: target - sum, used: used, short: 0, paths: [] };

  // 영역마다 0~3등급씩 올려보며 "올린 등급 수 합"이 가장 작은 조합들을 모은다 (4^4 = 256가지)
  let best = Infinity, paths = [];
  const n = pool.length;
  const gains = new Array(n).fill(0);
  (function walk(i) {
    if (i === n) {
      const cost = gains.reduce((s, v) => s + v, 0);
      if (cost > best || cost === 0) return;
      if (bestK(cur.map((v, j) => v - gains[j])) > target) return;
      const path = pool.map((p, j) => gains[j] ? { area: p.area, from: p.grade, to: p.grade - gains[j] } : null).filter(Boolean);
      if (cost < best) { best = cost; paths = []; }
      paths.push(path);
      return;
    }
    for (let d = 0; d <= Math.min(3, cur[i] - 1); d++) { gains[i] = d; walk(i + 1); }
    gains[i] = 0;
  })(0);

  // 한 영역을 2~3등급 끌어올리기보다 여러 영역을 1등급씩 올리는 쪽이 현실적이다.
  // 한 영역 최대 상승폭이 작은 길 → 손대는 영역이 적은 길 순으로 보여준다.
  const maxGain = p => Math.max.apply(null, p.map(s => s.from - s.to));
  paths.sort((a, b) => maxGain(a) - maxGain(b) || a.length - b.length);
  return { ok: false, sum: sum, used: used, short: sum - target, cost: best === Infinity ? null : best, paths: paths.slice(0, 3) };
}

return {
  // 상수
  AREAS, REL_AREAS, ABS_AREAS, PCT_CUTS, NATIONAL_RATIO, ABS_CUTS,
  EXAM_CATALOG, ORG_LABEL, SELECT_SUBJECTS, TRACK, TRACK_THRESHOLD, INTEGRATED_TAMGU,
  DEFAULT_UNIV_LINES,
  // 유틸
  num, avg, slope, round, textToRows,
  // 등급
  pctToMockGrade, absScoreToGrade, gradeToPctMid, fillSubject,
  // 회차
  examKey, makeExamMeta, sortExamKeys, parseExamCell, isIntegratedExam, applyCurriculum, areaLabel,
  // 파서
  detectMockHeader, parseMockWide, parseMockPaste, normalizeArea, forwardFill,
  // 개인 집계
  mockMainAvg, mainPctAvg, examSeries, examDelta, diagnoseSubjects,
  // 판정 · 라인
  judgeTrack, estimateJeongsiLine, csatMinCheck, best3Sum,
  // 학급 집계
  classMockStats, findMovers, buildHeatmap, allExamKeys, examMetaOf
};
});

/* ══════════════ 모의고사/mock-ui.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   모의고사 분석 UI (mock-ui.js)
   ───────────────────────────────────────────────────────────────
   index.html <script> 블록 끝(기존 코드 뒤)에 인라인 삽입한다.
   mock-engine.js가 먼저 로드되어 있어야 한다 (window.MockEngine).

   기존 코드에서 빌려 쓰는 것:
     showToast · XLSX · Chart · allStudents · currentStudent
     calcDecimalGrade9Equiv · entryGradeSystem · classifySubject
   ═══════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════
// 상태
// ═══════════════════════════════════════════════
const ME = (typeof window !== 'undefined' && window.MockEngine) || (typeof MockEngine !== 'undefined' ? MockEngine : {});

let mockStudents = {};                 // 이름 → { meta, exams }
let mockInputMode = 'excel';           // 'excel' | 'paste' | 'manual'
let mockGy = 3;                        // 업로드할 회차의 학년
let mockYear = new Date().getFullYear();
let mockMonth = 3;
let mockWeight = new Set(['국어', '수학', '영어', '탐구1', '탐구2']);
let mockMergeTamgu = false;
let mockDashKey = null;                // 학급 대시보드 기준 회차
let mockMoverTh = 3;                   // 급락/급상승 임계값
let mkCharts = {};                     // Chart 인스턴스 캐시
let currentResultTab = 'naesin';

// 정시 라인 기준표 — 모의고사/univ-lines.json과 같은 값을 유지할 것
let MOCK_UNIV_LINES = {
  updated: '2026-09',
  verified: false,
  source: '공식 자료가 아닌 개략 추정치입니다. 어디가(adiga.kr)에서 확인한 값으로 바꿔 쓰세요.',
  lines: [
    { minPct: 98.0, group: '의약계열 · 최상위권', example: '의예/치의예/약학, 서울대 주요학과' },
    { minPct: 95.5, group: '최상위권', example: '서울대 · 연세대 · 고려대 상위학과' },
    { minPct: 92.0, group: '상위권', example: '서강대 · 성균관대 · 한양대 · 중앙대 상위학과' },
    { minPct: 88.0, group: '수도권 상위', example: '경희대 · 한국외대 · 서울시립대 · 건국대' },
    { minPct: 82.0, group: '수도권 중상위', example: '동국대 · 홍익대 · 숙명여대 · 국민대 · 지방거점국립대 상위' },
    { minPct: 74.0, group: '수도권 중위 · 지방국립', example: '광운대 · 명지대 · 상명대 · 지방거점국립대' },
    { minPct: 62.0, group: '수도권 외곽 · 지방 상위', example: '가천대 · 한성대 · 지방 주요 사립대' },
    { minPct: 45.0, group: '지방 중위', example: '지방 사립대 일반학과' },
    { minPct: 0.0, group: '지방 · 전문대', example: '지방 사립대 · 전문대학' }
  ]
};

const MK_AREA_COLOR = {
  '국어': '#0ea5e9', '수학': '#8b5cf6', '영어': '#f59e0b',
  '한국사': '#64748b', '탐구1': '#14b8a6', '탐구2': '#e06b8b', '제2외국어': '#84cc16'
};

// ═══════════════════════════════════════════════
// 공통 유틸
// ═══════════════════════════════════════════════
function mkHasData() { return Object.keys(mockStudents).length > 0; }

/** 지금 테마의 색을 읽어온다 (밝은 톤 / 크림 톤에서 같은 코드로 맞추기 위해) */
function mkCss(name, alpha) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim() || '#888';
  if (alpha === undefined) return v;
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (!m) return v;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alpha + ')';
}
function mkEsc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mkFix(v, d) { return (typeof v === 'number' && isFinite(v)) ? v.toFixed(d === undefined ? 2 : d) : '-'; }

/** 모의 명단과 내신 명단을 합친 학생 목록 */
function mkAllNames() {
  const set = new Set(Object.keys(allStudents || {}));
  Object.keys(mockStudents).forEach(n => set.add(n));
  return [...set];
}

/** 등급 델타 표시 (등급은 낮을수록 좋음) */
function mkDelta(d, suffix) {
  if (d === null || d === undefined || !isFinite(d)) return '';
  const s = suffix || '';
  if (d === 0) return '<span class="mk-d same">' + ic('minus', 9) + '</span>';
  return d < 0
    ? '<span class="mk-d up">' + ic('arrowUp', 9) + Math.abs(Math.round(d * 100) / 100) + s + '</span>'
    : '<span class="mk-d down">' + ic('arrowDown', 9) + Math.abs(Math.round(d * 100) / 100) + s + '</span>';
}
/** 백분위 델타 (높을수록 좋음 — 방향 반대) */
function mkDeltaPct(d) {
  if (d === null || d === undefined || !isFinite(d)) return '';
  if (d === 0) return '<span class="mk-d same">' + ic('minus', 9) + '</span>';
  return d > 0
    ? '<span class="mk-d up">' + ic('arrowUp', 9) + Math.abs(d) + '</span>'
    : '<span class="mk-d down">' + ic('arrowDown', 9) + Math.abs(d) + '</span>';
}

function mkOrgClass(org) { return org === '평가원' ? 'eval' : (org === '수능' ? 'sat' : 'edu'); }

function mkDestroyChart(id) {
  if (mkCharts[id]) { try { mkCharts[id].destroy(); } catch (e) {} delete mkCharts[id]; }
}
function mkDestroyAllCharts() { Object.keys(mkCharts).forEach(mkDestroyChart); }

// ═══════════════════════════════════════════════
// 내신 → 9등급 축 환산 (기존 함수 재사용)
// ═══════════════════════════════════════════════

/** 학점 가중 평균 [{v, u}] — 하나라도 학점이 없으면 단순 평균 (섞으면 어느 쪽도 아닌 값이 나온다) */
function mkUnitMean(vals) {
  if (!vals.length) return null;
  const w = vals.every(x => x.u > 0);
  let s = 0, n = 0;
  vals.forEach(x => { const k = w ? x.u : 1; s += x.v * k; n += k; });
  return Math.round(s / n * 100) / 100;
}

/** 한 학생의 내신 평균을 9등급 축으로. 선택 과목만 반영(checkedSubjects). 학점 가중. */
function naesinAvg9For(name, subjSet) {
  const data = (allStudents || {})[name];
  if (!data) return null;
  const want = subjSet || (name === currentStudent && checkedSubjects && checkedSubjects.size ? checkedSubjects : null);
  const vals = [];
  for (const [key, d] of Object.entries(data)) {
    if (d.isMid || d.grade === null || d.grade === undefined) continue;
    if (want && want.size && !want.has(d.subject)) continue;
    const r = calcDecimalGrade9Equiv(d, key, name);
    if (r && isFinite(r.value)) vals.push({ v: r.value, u: d.unit });
    else if (entryGradeSystem(d) === 9) vals.push({ v: d.grade, u: d.unit });
  }
  return mkUnitMean(vals);
}

/** 학기별 내신 9등급 평균 [{term, avg}] — 추세·대비 차트용 */
function naesinTermAvg9(name, subjSet) {
  const data = (allStudents || {})[name];
  if (!data) return [];
  const order = ['1학년 1학기', '1학년 2학기', '2학년 1학기', '2학년 2학기', '3학년 1학기', '3학년 2학기'];
  const want = subjSet || (name === currentStudent && checkedSubjects && checkedSubjects.size ? checkedSubjects : null);
  const bucket = {};
  for (const [key, d] of Object.entries(data)) {
    if (d.isMid || !d.term || d.grade === null) continue;
    if (want && want.size && !want.has(d.subject)) continue;
    const r = calcDecimalGrade9Equiv(d, key, name);
    const v = (r && isFinite(r.value)) ? r.value : (entryGradeSystem(d) === 9 ? d.grade : null);
    if (v === null) continue;
    (bucket[d.term] || (bucket[d.term] = [])).push({ v: v, u: d.unit });
  }
  return order.filter(t => bucket[t]).map(t => ({ term: t, avg: mkUnitMean(bucket[t]) }));
}

function naesinTrend9(name) {
  const list = naesinTermAvg9(name);
  return list.length >= 2 ? ME.slope(list.map(x => x.avg)) : null;
}

// ═══════════════════════════════════════════════
// 좌측 패널 — 업로드
// ═══════════════════════════════════════════════

function mkInitPanel() {
  const ySel = document.getElementById('mk-year');
  const now = new Date().getFullYear();
  ySel.innerHTML = '';
  for (let y = now + 1; y >= now - 4; y--) {
    ySel.innerHTML += '<option value="' + y + '"' + (y === now ? ' selected' : '') + '>' + y + '년</option>';
  }
  mockYear = now;
  mkRenderMonths();
  mkRenderChips();
}

/** 학년에 맞는 회차 월 목록 */
function mkRenderMonths() {
  const sel = document.getElementById('mk-month');
  const cat = ME.EXAM_CATALOG[mockGy] || ME.EXAM_CATALOG[3];
  const months = Object.keys(cat).map(Number).sort((a, b) => a - b);
  if (months.indexOf(mockMonth) < 0) mockMonth = months[0];
  sel.innerHTML = months.map(m => {
    const meta = ME.makeExamMeta(mockYear, m, mockGy);
    return '<option value="' + m + '"' + (m === mockMonth ? ' selected' : '') + '>' + mkEsc(meta.label) + '</option>';
  }).join('');
}

function mkOnExamChange() {
  mockYear = parseInt(document.getElementById('mk-year').value, 10);
  mockGy = parseInt(document.getElementById('mk-gy').value, 10);
  mockMonth = parseInt(document.getElementById('mk-month').value, 10);
  mkRenderMonths();
  mkRefreshManualForm();
}
function mkOnGyChange() {
  mockGy = parseInt(document.getElementById('mk-gy').value, 10);
  mkRenderMonths();
  mkRefreshManualForm();
}
/** 직접 입력 표는 체제(공통/선택)가 바뀔 때만 다시 그린다 — 입력하던 값이 지워지지 않게 */
let mkManualInteg = null;
function mkRefreshManualForm() {
  if (mockInputMode !== 'manual') return;
  if (ME.isIntegratedExam({ year: mockYear, gy: mockGy }) !== mkManualInteg) mkRenderManual();
}

function selectMockInput(mode) {
  mockInputMode = mode;
  ['excel', 'paste', 'manual'].forEach(m => {
    const b = document.getElementById('mk-sub-' + m);
    if (b) b.classList.toggle('active', m === mode);
    const p = document.getElementById('mk-pane-' + m);
    if (p) p.style.display = m === mode ? 'block' : 'none';
  });
  if (mode === 'manual') mkRenderManual();
}

// ── ① 엑셀 ──
function mkOnDragOver(e) { e.preventDefault(); document.getElementById('mk-zone').classList.add('drag'); }
function mkOnDragLeave(e) { document.getElementById('mk-zone').classList.remove('drag'); }
function mkOnDrop(e) { e.preventDefault(); document.getElementById('mk-zone').classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) mkParseFile(f); }
function mkOnFileChange(e) { const f = e.target.files[0]; if (f) mkParseFile(f); }

/** 확장자로 갈라서 파싱 → 반 선택 대기 상태로 */
function mkParseFile(file) {
  const isPdf = /\.pdf$/i.test(file.name);
  const reader = new FileReader();
  reader.onload = ev => {
    if (isPdf) mkParsePdfFile(file, ev.target.result);
    else mkParseXlsxFile(file, ev.target.result);
  };
  reader.readAsArrayBuffer(file);
}

// ── 엑셀 ──
// 학교에서 쓰는 통계 파일은 차트·수식 시트가 붙어 수십 MB까지 간다.
// 행 수를 넉넉히 자르고 서식·수식을 버려야 브라우저가 멈추지 않는다.
const MK_XLSX_ROWCAP = 3000;
const MK_XLSX_OPTS = {
  type: 'array', sheetRows: MK_XLSX_ROWCAP,
  cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false, cellDates: false
};

async function mkParseXlsxFile(file, buf) {
  const info = document.getElementById('mk-file-info');
  if (info) {
    info.style.display = 'block';
    info.innerHTML = '엑셀 읽는 중… ' + (buf.byteLength > 5e6 ? '(' + (buf.byteLength / 1048576).toFixed(0) + 'MB — 몇 초 걸립니다)' : '');
    // 위 문구가 실제로 그려지도록 한 틱 양보한다 (XLSX.read는 동기라 화면이 멈춘다)
    await new Promise(r => setTimeout(r, 40));
  }
  try {
    const wb = XLSX.read(new Uint8Array(buf), MK_XLSX_OPTS);
    const merged = {};
    let truncated = false;
    let metaUsed = null;
    let total = 0;
    const used = [];
    let anyEstimated = false;

    // '저장'처럼 원자료 시트가 있으면 그것만 본다 (통계·그래프 시트 오탐 방지)
    const RAW_SHEETS = ['저장', '원자료', '성적', 'data', 'raw'];
    let sheets = wb.SheetNames.filter(n => RAW_SHEETS.indexOf(String(n).trim().toLowerCase()) >= 0 ||
      RAW_SHEETS.indexOf(String(n).trim()) >= 0);
    if (!sheets.length) sheets = wb.SheetNames;

    for (const sheetName of sheets) {
      if (!wb.Sheets[sheetName]) continue;
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
      if (!rows.length) continue;
      // 시트가 65535행으로 선언돼 있어도 실제 데이터는 앞부분뿐인 경우가 많다.
      // 마지막 '내용이 있는 행'이 상한에 닿았을 때만 잘림으로 본다.
      if (rows.length >= MK_XLSX_ROWCAP) {
        let lastFilled = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          if ((rows[i] || []).some(v => String(v).trim() !== '')) { lastFilled = i; break; }
        }
        if (lastFilled >= MK_XLSX_ROWCAP - 50) truncated = true;
      }

      // 회차 인식 순서: 시트명 → 파일명 → 화면에서 고른 값
      let meta = ME.parseExamCell(sheetName, { year: mockYear, gy: mockGy })
        || ME.parseExamCell(file.name, { year: mockYear, gy: mockGy })
        || ME.makeExamMeta(mockYear, mockMonth, mockGy);
      metaUsed = meta;

      const res = ME.parseMockWide(rows, meta);
      const n = Object.keys(res.students).length;
      if (!n) continue;
      for (const [nm, stu] of Object.entries(res.students)) {
        for (const ex of Object.values(stu.exams)) {
          for (const s of Object.values(ex.subjects)) if (s.gradeDerived) anyEstimated = true;
        }
        if (!merged[nm]) merged[nm] = stu;
        else Object.assign(merged[nm].exams, stu.exams);
      }
      total += n;
      used.push(sheetName + '(' + n + '명)');
    }

    if (!total) {
      showToast('모의고사 성적을 찾지 못했습니다. 「예시 양식」을 내려받아 형식을 확인해주세요.');
      return;
    }
    const notes = [];
    if (metaUsed) {
      const auto = ME.parseExamCell(file.name, { year: mockYear, gy: mockGy });
      notes.push('회차: <b>' + mkEsc(metaUsed.fullLabel) + '</b>' +
        (auto ? ' <span style="font-weight:600">(파일명에서 자동 인식)</span>'
              : ' <span style="font-weight:600">— 위에서 고른 값입니다. 다르면 취소하고 바꿔주세요.</span>'));
    }
    if (anyEstimated) notes.push('등급이 비어 있는 영역은 백분위·원점수에서 산출했습니다.');
    if (truncated) notes.push('시트가 ' + MK_XLSX_ROWCAP + '행을 넘어 앞부분만 읽었습니다. 학생이 빠졌다면 알려주세요.');
    notes.push('학교에서 자체 집계한 엑셀은 <b>표준점수·백분위·등급이 공식 성적표와 다를 수 있습니다.</b> 정확한 등급이 필요하면 <b>성적표 PDF</b>를 올리세요.');
    mkSetPending(merged, file.name, used.join(', '), notes);
  } catch (err) {
    console.error(err);
    if (info) { info.style.display = 'none'; info.innerHTML = ''; }
    showToast('엑셀 파싱 실패: ' + err.message);
  }
}

// ── PDF ──
async function mkParsePdfFile(file, buf) {
  if (typeof pdfjsLib === 'undefined') {
    showToast('PDF 기능을 쓸 수 없습니다 (pdf.js 미로드).');
    return;
  }
  const info = document.getElementById('mk-file-info');
  info.style.display = 'block';
  info.innerHTML = 'PDF 읽는 중…';
  try {
    const res = await mkParsePdf(buf, (i, n) => {
      info.innerHTML = 'PDF 읽는 중… ' + i + '/' + n + '쪽';
    });
    const kindLabel = res.kind === 'report' ? '성적통지표(학생용)' : '성적일람표(학급별)';
    const notes = [];
    notes.push('회차를 <b>' + res.meta.fullLabel + '</b>(으)로 자동 인식했습니다.');
    if (res.kind === 'roster') notes.push('일람표에는 원점수가 없습니다. 원점수까지 필요하면 <b>성적표 PDF</b>를 올리세요.');
    if (res.warnings.length) notes.push('읽지 못한 쪽: ' + res.warnings.join(', '));
    mkSetPending(res.students, file.name, kindLabel + ' · ' + res.pageCount + '쪽 · ' + res.parsed + '명', notes, res.meta);
  } catch (err) {
    console.error(err);
    // 토스트는 금방 사라지니 이유를 업로드 칸 아래에도 남겨 둔다
    info.innerHTML = ic('alert', 13) + ' ' + mkEsc(err.message);
    showToast('PDF 파싱 실패: ' + err.message);
  }
}

// ═══════════════════════════════════════════════
// 반 선택 (불러오기 확인 단계)
// ═══════════════════════════════════════════════
let mkPending = null;

function mkSetPending(students, title, sub, notes, meta) {
  const byCls = {};
  for (const [nm, stu] of Object.entries(students)) {
    const c = (stu.meta && stu.meta.cls) ? String(stu.meta.cls) : '?';
    (byCls[c] || (byCls[c] = [])).push(nm);
  }
  const classes = Object.keys(byCls).sort((a, b) => (parseInt(a, 10) || 99) - (parseInt(b, 10) || 99));
  mkPending = { students: students, byCls: byCls, classes: classes, picked: new Set(classes), title: title, sub: sub, notes: notes || [], meta: meta };

  // 반이 하나뿐이면 굳이 고르게 하지 않는다
  if (classes.length <= 1) { mkCommitPending(); return; }
  mkRenderPending();
}

function mkRenderPending() {
  const box = document.getElementById('mk-pending');
  if (!box || !mkPending) return;
  const p = mkPending;
  const total = Object.keys(p.students).length;
  const pickedN = [...p.picked].reduce((a, c) => a + (p.byCls[c] ? p.byCls[c].length : 0), 0);

  const info = document.getElementById('mk-file-info');
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }

  box.style.display = 'block';
  box.innerHTML =
    '<div class="mk-pend-head">' + mkEsc(p.title) + '<span>' + mkEsc(p.sub) + '</span></div>' +
    (p.notes.length ? '<div class="mk-banner info" style="margin:8px 0">' + p.notes.join('<br>') + '</div>' : '') +
    '<div class="sub-lbl">불러올 반을 고르세요 (전교 ' + total + '명)</div>' +
    '<div class="mk-cls-grid">' +
    p.classes.map(c =>
      '<label class="mk-cls' + (p.picked.has(c) ? ' on' : '') + '">' +
      '<input type="checkbox" ' + (p.picked.has(c) ? 'checked' : '') + ' onchange="mkTogglePendCls(\'' + c + '\')">' +
      '<b>' + (c === '?' ? '반 미상' : c + '반') + '</b><span>' + p.byCls[c].length + '명</span></label>'
    ).join('') +
    '</div>' +
    '<div class="mk-pend-acts">' +
    '<button class="ghost" onclick="mkPendAll(true)">전체 선택</button>' +
    '<button class="ghost" onclick="mkPendAll(false)">전체 해제</button>' +
    '<button class="go" onclick="mkCommitPending()">' + ic('check', 14) + ' 선택한 ' + pickedN + '명 불러오기</button>' +
    '<button class="ghost" onclick="mkCancelPending()">취소</button>' +
    '</div>';
}

function mkTogglePendCls(c) {
  if (!mkPending) return;
  if (mkPending.picked.has(c)) mkPending.picked.delete(c); else mkPending.picked.add(c);
  mkRenderPending();
}
function mkPendAll(on) {
  if (!mkPending) return;
  mkPending.picked = on ? new Set(mkPending.classes) : new Set();
  mkRenderPending();
}
function mkCancelPending() {
  mkPending = null;
  const box = document.getElementById('mk-pending');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  const info = document.getElementById('mk-file-info');
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  showToast('불러오기를 취소했습니다.');
}

function mkCommitPending() {
  if (!mkPending) return;
  const p = mkPending;

  // 고른 반만 추리고, 저장소 키를 '이름'으로 바꾼다.
  // (내신 데이터와 이름으로 맞물려야 통합 비교가 된다)
  const take = {};
  const dup = [];
  for (const stu of Object.values(p.students)) {
    const c = (stu.meta && stu.meta.cls) ? String(stu.meta.cls) : '?';
    if (p.classes.length > 1 && !p.picked.has(c)) continue;

    const base = (stu.meta && stu.meta.name) || '?';
    let nm = base;
    // 이번에 고른 범위 안에서도, 이미 올려둔 데이터와도 겹치면 안 된다.
    // 반·번호가 다르면 동명이인이므로 이름 뒤에 표시를 붙인다.
    const clash = t => (take[t] && !mkSameStudent(take[t].meta, stu.meta)) ||
                       (mockStudents[t] && !mkSameStudent(mockStudents[t].meta, stu.meta));
    if (clash(nm)) {
      const tag = (stu.meta.cls ? stu.meta.cls + '반' : '') + (stu.meta.num ? stu.meta.num + '번' : '');
      let cand = base + (tag ? '(' + tag + ')' : '·2');
      let i = 2;
      while (clash(cand)) { cand = base + '·' + (++i); }
      nm = cand;
      dup.push(base + ' → ' + nm);
    }
    take[nm] = stu;
  }
  const n = Object.keys(take).length;
  if (!n) { showToast('선택한 반이 없습니다.'); return; }

  mkMerge(take);
  if (dup.length) {
    setTimeout(() => showToast('동명이인 ' + dup.length + '명은 이름에 반·번호를 붙여 구분했습니다: ' + dup.slice(0, 2).join(', ')), 1200);
  }
  const box = document.getElementById('mk-pending');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  const info = document.getElementById('mk-file-info');
  if (info) {
    info.style.display = 'block';
    info.innerHTML = ic('check', 13) + ' ' + mkEsc(p.title) + ' — ' + n + '명 불러옴' +
      (p.classes.length > 1 ? ' (' + [...p.picked].sort().join('·') + '반)' : '');
  }
  mkPending = null;
  mkAfterLoad('모의고사 ' + n + '명 불러오기 완료!');
}

// ── ② 붙여넣기 ──
function mkApplyPaste() {
  const txt = document.getElementById('mk-paste').value;
  if (!txt.trim()) { showToast('붙여넣은 내용이 없습니다.'); return; }
  const meta = ME.makeExamMeta(mockYear, mockMonth, mockGy);
  const res = ME.parseMockPaste(txt, meta);
  const n = Object.keys(res.students).length;
  if (!n) {
    showToast('표를 인식하지 못했습니다. 첫 줄에 헤더(이름·국어등급 …)가 있는지 확인해주세요.');
    return;
  }
  document.getElementById('mk-paste').value = '';
  mkSetPending(res.students, '붙여넣기', meta.year + '년 ' + meta.label + ' · ' + n + '명', []);
}

// ── ③ 수동 입력 ──
function mkRenderManual() {
  const names = mkAllNames();
  const sel = document.getElementById('mk-man-stu');
  const keep = sel.value;
  sel.innerHTML = '<option value="">-- 학생 선택 --</option>' +
    names.map(n => '<option value="' + mkEsc(n) + '">' + mkEsc(n) + '</option>').join('');
  if (keep && names.indexOf(keep) >= 0) sel.value = keep;

  const areas = ['국어', '수학', '영어', '한국사', '탐구1', '탐구2'];
  // 공통 체제(고1·2)는 국어·수학 선택과목이 없고 탐구는 통합사회·통합과학으로 정해져 있어 과목명 칸을 받지 않는다
  const exam = { year: mockYear, gy: mockGy };
  const integ = ME.isIntegratedExam(exam);
  mkManualInteg = integ;
  let html = '<table class="mk-table"><thead><tr><th>영역</th><th>원점수</th><th>표준점수</th><th>백분위</th><th>등급</th><th>' + (integ ? '' : '선택과목') + '</th></tr></thead><tbody>';
  for (const a of areas) {
    const isAbs = ME.ABS_AREAS.indexOf(a) >= 0;
    html += '<tr><td class="rowhead">' + ME.areaLabel(a, exam) + '</td>' +
      '<td><input class="mk-mi" data-a="' + a + '" data-f="raw" type="number" step="0.1"></td>' +
      '<td>' + (isAbs ? '<span style="color:var(--ink-3)">—</span>' : '<input class="mk-mi" data-a="' + a + '" data-f="std" type="number" step="0.1">') + '</td>' +
      '<td>' + (isAbs ? '<span style="color:var(--ink-3)">—</span>' : '<input class="mk-mi" data-a="' + a + '" data-f="pct" type="number" step="0.1">') + '</td>' +
      '<td><input class="mk-mi" data-a="' + a + '" data-f="grade" type="number" min="1" max="9"></td>' +
      '<td>' + (integ ? '' : '<input class="mk-mi" data-a="' + a + '" data-f="sel" type="text" placeholder="' + (a.indexOf('탐구') === 0 ? '생활과윤리' : (a === '국어' ? '언어와매체' : (a === '수학' ? '미적분' : '—'))) + '">') + '</td></tr>';
  }
  html += '</tbody></table>';
  document.getElementById('mk-man-table').innerHTML = html;
  document.querySelectorAll('.mk-mi').forEach(i => {
    i.style.cssText = 'width:100%;min-width:52px;padding:3px 4px;border:1px solid var(--line);border-radius:5px;background:var(--paper);color:var(--ink);font-size:10.5px;font-family:inherit';
  });
}

function mkSaveManual() {
  const name = document.getElementById('mk-man-stu').value;
  if (!name) { showToast('학생을 선택하세요.'); return; }
  const meta = ME.makeExamMeta(mockYear, mockMonth, mockGy);
  const subjects = {};
  document.querySelectorAll('.mk-mi').forEach(i => {
    const v = i.value.trim();
    if (!v) return;
    const a = i.dataset.a;
    (subjects[a] || (subjects[a] = {}))[i.dataset.f] = v;
  });
  const filled = {};
  let any = false;
  for (const [a, item] of Object.entries(subjects)) {
    const f = ME.fillSubject(a, item);
    if (f.grade === null && f.pct === null && f.raw === null) continue;
    filled[a] = f; any = true;
  }
  if (!any) { showToast('입력된 성적이 없습니다.'); return; }

  const stu = {};
  stu[name] = { meta: { name: name, uid: null, cls: null, num: null }, exams: {} };
  stu[name].exams[meta.key] = Object.assign({}, meta, { subjects: filled });
  mkMerge(stu);
  document.querySelectorAll('.mk-mi').forEach(i => { i.value = ''; });
  mkAfterLoad('' + name + ' · ' + meta.label + ' 저장 완료!');
}

/** 두 meta가 같은 학생인지. 반·번호가 둘 다 있는데 다르면 다른 사람이다. */
function mkSameStudent(a, b) {
  if (!a || !b) return true;
  if (a.uid && b.uid) return String(a.uid) === String(b.uid);
  if (a.cls && b.cls && String(a.cls) !== String(b.cls)) return false;
  if (a.num && b.num && Number(a.num) !== Number(b.num)) return false;
  return true;
}

// ── 공통 체제 (고1·2: 국어·수학 선택과목 없음, 탐구 = 통합사회·통합과학) ──
/** 영역 표시명. 탐구 슬롯은 넘긴 회차가 모두 공통 체제일 때만 통합사회·통합과학으로 부른다. */
function mkAreaName(a, exams) {
  const list = (Array.isArray(exams) ? exams : [exams]).filter(Boolean);
  if (!ME.INTEGRATED_TAMGU[a] || !list.length) return a;
  return list.every(e => ME.isIntegratedExam(e)) ? ME.INTEGRATED_TAMGU[a] : a;
}
/** 불러온 회차 전체의 메타 */
function mkAllExamMetas() {
  return ME.allExamKeys(mockStudents).map(k => ME.examMetaOf(mockStudents, k));
}
/** 학생의 최근 회차가 공통 체제인지 */
function mkStuIntegrated(name) {
  const ser = ME.examSeries(mockStudents[name]);
  return ser.length > 0 && ME.isIntegratedExam(ser[ser.length - 1]);
}

// ── 병합 / 후처리 ──
function mkMerge(students) {
  for (const [name, stu] of Object.entries(students)) {
    if (!mockStudents[name]) mockStudents[name] = { meta: stu.meta, exams: {} };
    else Object.assign(mockStudents[name].meta, Object.fromEntries(Object.entries(stu.meta).filter(([, v]) => v !== null && v !== '')));
    for (const [k, ex] of Object.entries(stu.exams)) {
      if (mockStudents[name].exams[k]) Object.assign(mockStudents[name].exams[k].subjects, ex.subjects);
      else mockStudents[name].exams[k] = ex;
      ME.applyCurriculum(mockStudents[name].exams[k]);
    }
  }
}

function mkAfterLoad(msg) {
  const keys = ME.allExamKeys(mockStudents);
  if (!mockDashKey || keys.indexOf(mockDashKey) < 0) mockDashKey = keys[keys.length - 1] || null;
  mkRenderChips();
  mkSyncStudentSelect();
  mkUpdateTabBadges();
  mkStoreTouch();
  showToast(msg);
  if (currentStudent || mkHasData()) {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('result-area').style.display = 'block';
    if (currentResultTab === 'mock') renderMockTab();
    else if (currentResultTab === 'fusion') renderFusionTab();
  }
}

/** 내신 명단이 비어 있으면 모의 명단으로 학생 드롭다운을 채운다 */
function mkSyncStudentSelect() {
  const sel = document.getElementById('stu-sel');
  const have = new Set([...sel.options].map(o => o.value).filter(Boolean));
  let added = 0;
  Object.keys(mockStudents).forEach(n => {
    if (have.has(n)) return;
    const o = document.createElement('option');
    o.value = n; o.textContent = n + ' (모의)';
    sel.appendChild(o); added++;
  });
  if (added) document.getElementById('s1').classList.remove('collapsed');
  if (typeof stuNoLabelSelect === 'function') stuNoLabelSelect();   // 「12번 김민수」 (ui/shell.js)
  // 일괄 처리 인원은 내신·모의 합집합으로 항상 다시 적는다
  const bc = document.getElementById('batch-count');
  if (bc) bc.textContent = mkBatchNames().length + '명';
}

function mkRenderChips() {
  const box = document.getElementById('mk-chips');
  const keys = ME.allExamKeys(mockStudents);
  if (!keys.length) {
    box.innerHTML = '<span style="font-size:10.5px;color:var(--ink-3);font-weight:700">아직 불러온 회차가 없습니다.</span>';
    return;
  }
  box.innerHTML = keys.map(k => {
    const m = ME.examMetaOf(mockStudents, k);
    let n = 0;
    Object.values(mockStudents).forEach(s => { if (s.exams[k]) n++; });
    return '<span class="mk-chip ' + mkOrgClass(m.org) + '">' + m.year + ' ' + mkEsc(m.label) +
      ' · ' + n + '명 <span class="x" onclick="mkRemoveExam(\'' + k + '\')" title="이 회차 삭제">' + ic('x', 12) + '</span></span>';
  }).join('');
}

function mkRemoveExam(key) {
  for (const stu of Object.values(mockStudents)) delete stu.exams[key];
  for (const [name, stu] of Object.entries(mockStudents)) {
    if (!Object.keys(stu.exams).length) delete mockStudents[name];
  }
  const keys = ME.allExamKeys(mockStudents);
  if (mockDashKey === key) mockDashKey = keys[keys.length - 1] || null;
  mkRenderChips();
  mkUpdateTabBadges();
  if (currentResultTab === 'mock') renderMockTab();
  else if (currentResultTab === 'fusion') renderFusionTab();
  showToast('회차를 삭제했습니다.');
}

/** 예시 양식 (고1·2 공통 체제) — 국어·수학 선택과목 없음, 탐구 = 통합사회·통합과학 */
function mkDownloadTemplateIntegrated() {
  const HEADER = [
    '학번', '반', '번호', '이름',
    '국어원점수', '국어표준점수', '국어백분위', '국어등급',
    '수학원점수', '수학표준점수', '수학백분위', '수학등급',
    '영어원점수', '영어등급',
    '한국사원점수', '한국사등급',
    '통합사회원점수', '통합사회표준점수', '통합사회백분위', '통합사회등급',
    '통합과학원점수', '통합과학표준점수', '통합과학백분위', '통합과학등급'
  ];
  const rows = [
    ['모의고사 성적 업로드 예시 양식 (고1·2) — 성적 돋보기'],
    ['· 헤더 행(7행)은 그대로 두고 8행부터 학생 데이터를 채워 넣으세요.'],
    ['· 학번이 있으면 학번으로, 없으면 반+번호로, 그것도 없으면 이름으로 매칭합니다.'],
    ['· 모르는 값은 비워두세요. 등급이 비면 백분위(영어·한국사는 원점수)에서 자동 산출합니다.'],
    ['· 고1·2는 국어·수학 선택과목이 없고 탐구는 통합사회·통합과학입니다. 3학년 양식은 회차 학년을 3학년으로 바꾸고 내려받으세요.'],
    [],
    HEADER,
    ['2026-0101', '1', 1, '홍길동', 89, 129, 86.7, 2, 77, 124, 79.2, 3, 88, 2, 42, 1, 45, 66, 81.3, 3, 40, 62, 74.5, 3],
    ['2026-0102', '1', 2, '김철수', '', '', 95.1, '', '', '', 91.0, '', 91, '', 38, '', '', '', 88.2, '', '', '', 85.0, '']
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADER.map((h, i) => ({ wch: i < 4 ? 10 : 14 }));
  XLSX.utils.book_append_sheet(wb, ws, '모의고사성적');
  xlWriteSheetJS(wb, '모의고사성적_예시양식_고1·2.xlsx').catch(e => showToast('엑셀 저장 실패: ' + e.message)); // 글꼴 통일
  showToast('고1·2 예시 양식을 내려받았습니다.');
}

/** 예시 양식 xlsx 다운로드 */
function mkDownloadTemplate() {
  if (ME.isIntegratedExam({ year: mockYear, gy: mockGy })) return mkDownloadTemplateIntegrated();
  const HEADER = [
    '학번', '반', '번호', '이름',
    '국어원점수', '국어표준점수', '국어백분위', '국어등급', '국어선택과목',
    '수학원점수', '수학표준점수', '수학백분위', '수학등급', '수학선택과목',
    '영어원점수', '영어등급',
    '한국사원점수', '한국사등급',
    '탐구1원점수', '탐구1표준점수', '탐구1백분위', '탐구1등급', '탐구1과목명',
    '탐구2원점수', '탐구2표준점수', '탐구2백분위', '탐구2등급', '탐구2과목명'
  ];
  const rows = [
    ['모의고사 성적 업로드 예시 양식 — 성적 돋보기'],
    ['· 헤더 행(7행)은 그대로 두고 8행부터 학생 데이터를 채워 넣으세요.'],
    ['· 학번이 있으면 학번으로, 없으면 반+번호로, 그것도 없으면 이름으로 매칭합니다.'],
    ['· 모르는 값은 비워두세요. 등급이 비면 백분위(영어·한국사는 원점수)에서 자동 산출합니다.'],
    ['· 영어·한국사는 절대평가라 표준점수·백분위가 없습니다.'],
    [],
    HEADER,
    ['2024-0101', '1', 1, '홍길동', 89, 129, 86.7, 2, '언어와매체', 77, 124, 79.2, 3, '미적분', 88, 2, 42, 1, 45, 66, 81.3, 3, '생활과윤리', 40, 62, 74.5, 3, '사회문화'],
    ['2024-0102', '1', 2, '김철수', '', '', 95.1, '', '화법과작문', '', '', 91.0, '', '확률과통계', 91, '', 38, '', '', '', 88.2, '', '물리학Ⅰ', '', '', 85.0, '', '화학Ⅰ']
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADER.map((h, i) => ({ wch: i < 4 ? 10 : 13 }));
  XLSX.utils.book_append_sheet(wb, ws, '모의고사성적');
  xlWriteSheetJS(wb, '모의고사성적_예시양식.xlsx').catch(e => showToast('엑셀 저장 실패: ' + e.message)); // 글꼴 통일
  showToast('예시 양식을 내려받았습니다.');
}

// ═══════════════════════════════════════════════
// 결과 탭 전환
// ═══════════════════════════════════════════════
function switchResultTab(tab) {
  currentResultTab = tab;
  ['naesin', 'mock', 'fusion', 'care'].forEach(t => {
    const b = document.getElementById('rtab-' + t);
    if (b) b.classList.toggle('active', t === tab);
    const p = document.getElementById('tab-' + t);
    if (p) p.style.display = t === tab ? 'block' : 'none';
  });
  // 탭에 따라 상단 출력 버튼 구성이 달라진다 (통합 탭에는 프롬프트가 없다)
  document.body.classList.remove('tab-naesin', 'tab-mock', 'tab-fusion', 'tab-care');
  document.body.classList.add('tab-' + tab);
  if (typeof careMarkNaesin === 'function') careMarkNaesin();
  if (tab === 'mock') renderMockTab();
  else if (tab === 'fusion') renderFusionTab();
  else if (tab === 'care' && typeof renderCareTab === 'function') renderCareTab();
}

function mkUpdateTabBadges() {
  const n = ME.allExamKeys(mockStudents).length;
  const b = document.getElementById('rtab-mock-badge');
  if (b) { b.textContent = n ? n + '회차' : ''; b.style.display = n ? '' : 'none'; }
}

function mkEmpty(icon, title, desc) {
  return '<div class="mk-empty">' + ic(icon, 46) + '<div class="ti">' + title + '</div><div class="ds">' + desc + '</div></div>';
}

// ═══════════════════════════════════════════════
// 탭 ② 모의고사 분석
// ═══════════════════════════════════════════════
function renderMockTab() {
  const wrap = document.getElementById('tab-mock');
  mkDestroyAllCharts();

  if (!mkHasData()) {
    wrap.innerHTML = mkEmpty('trend', '모의고사 데이터가 없습니다',
      '왼쪽 <b>「1-2 모의고사 성적」</b> 섹션에서 학력평가 결과를 올려주세요.<br>엑셀 업로드 · 표 붙여넣기 · 직접 입력 중 편한 방법을 쓰면 됩니다.');
    return;
  }

  const name = currentStudent;
  const stu = name ? mockStudents[name] : null;
  let html = '';

  // ── 개인 영역 ──
  if (stu) {
    const series = ME.examDelta(ME.examSeries(stu, mockWeight, mockMergeTamgu));
    const recent = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;

    html += mkKpiCard(name, series, recent, prev);
    html += mkChangeCard(series);
    html += mkWeightCard();
    html += mkScoreTableCard(series);
    html += mkTrendCard();
    html += mkDiagnosisCard(stu);
    html += mkCsatCard(recent);
    html += mkPromptCard();
  } else {
    html += '<div class="result-card">' + mkEmpty('user', '학생을 선택하면 개인 분석이 나옵니다',
      '왼쪽 <b>2번 학생 선택</b>에서 학생을 고르세요. 아래 학급 통계는 학생 선택 없이도 볼 수 있습니다.') + '</div>';
  }

  // ── 학급 영역 ──
  // 학생을 골라 인쇄하면 그 학생 상담 자료다 → 다른 학생 이름이 나오는 학급 통계는 인쇄에서 뺀다.
  // 학생을 안 고르고 인쇄하면 '학급 통계' 출력이므로 그대로 찍힌다.
  html += '<div class="mk-class-sec' + (stu ? ' no-print' : '') + '">' + mkClassSection() + '</div>';

  wrap.innerHTML = html;

  // 차트는 DOM이 붙은 뒤 생성
  if (stu) mkBuildTrendChart(stu);
  if (stu) mkBuildRadarChart(stu);
  mkBuildDistChart();
}

// ── KPI ──
function mkKpiCard(name, series, recent, prev) {
  const items = [];
  items.push(tile('응시 회차', series.length, '회', ME.examMetaOf(mockStudents, series[0].key).label + ' ~ ' + recent.label, 'var(--good)'));

  const avgColor = recent.mainAvg <= 2 ? 'var(--good)' : (recent.mainAvg <= 4 ? 'var(--warn)' : 'var(--bad)');
  const dTxt = recent.delta === null ? '첫 회차'
    : (recent.delta === 0 ? '직전과 동일'
      : '직전 대비 ' + (recent.delta < 0 ? '개선 ' : '하락 ') + Math.abs(recent.delta).toFixed(2) + '등급');
  items.push(tile('주요과목 평균등급', mkFix(recent.mainAvg), '등급', dTxt, avgColor));

  const pctAvg = ME.mainPctAvg(recent);
  items.push(tile('국수영탐 백분위 평균', pctAvg === null ? '-' : mkFix(pctAvg, 1), '', '상위 ' + (pctAvg === null ? '-' : mkFix(100 - pctAvg, 1)) + '%', 'var(--accent)'));

  // 최고/최저 영역
  const areaList = ME.AREAS.map(a => recent.subjects[a] ? { a: a, g: recent.subjects[a].grade, n: recent.subjects[a].sel || a } : null)
    .filter(x => x && x.g !== null).sort((x, y) => x.g - y.g);
  if (areaList.length) {
    items.push(tile('최고 영역', areaList[0].g, '등급', mkEsc(areaList[0].n), '#0d9488'));
    items.push(tile('최저 영역', areaList[areaList.length - 1].g, '등급', mkEsc(areaList[areaList.length - 1].n), '#e11d48'));
  }

  // 탐구는 두 과목 중 좋은 쪽 1과목 — 수능 최저 시뮬레이터와 같은 기준
  const sum = ME.best3Sum(recent);
  if (sum !== null) {
    items.push(tile('상위 3개 등급합', sum, '', sum <= 6 ? '주요대 최저 유력' : (sum <= 9 ? '중위권 최저 선' : '최저 없는 전형 권장'),
      sum <= 6 ? '#0d9488' : (sum <= 9 ? 'var(--warn)' : 'var(--bad)')));
  }

  function tile(t, v, u, s, c) {
    return '<div class="mk-tile"><div class="t">' + t + '</div><div class="v" style="color:' + c + '">' + v +
      (u ? '<span class="u">' + u + '</span>' : '') + '</div><div class="s">' + s + '</div></div>';
  }

  return '<div class="result-card"><div class="result-title">' + ic('trend', 17) + ' ' + mkEsc(name) +
    ' · 모의고사 요약 <span style="font-size:10.5px;font-weight:700;color:var(--ink-3);margin-left:6px">최근 회차: ' +
    mkEsc(recent.fullLabel) + '</span></div><div class="mk-kpi">' + items.join('') + '</div></div>';
}

// ── 반영 과목 선택 ──
function mkWeightCard() {
  const areas = ['국어', '수학', '영어', '한국사', '탐구1', '탐구2'];
  const metas = mkAllExamMetas();
  const chips = areas.map(a =>
    '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;cursor:pointer;padding:3px 8px;border-radius:8px;border:1.5px solid ' +
    (mockWeight.has(a) ? 'var(--good);background:var(--good-2);color:var(--good)' : 'var(--line-2);background:var(--paper);color:var(--ink-3)') + '">' +
    '<input type="checkbox" ' + (mockWeight.has(a) ? 'checked' : '') + ' onchange="mkToggleWeight(\'' + a + '\')" style="accent-color:#0d9488"> ' + mkAreaName(a, metas) + '</label>'
  ).join(' ');

  return '<div class="result-card"><div class="result-title">' + ic('sliders', 17) + ' 평균등급 반영 과목</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' + chips +
    '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;cursor:pointer;margin-left:8px;color:var(--ink-2)">' +
    '<input type="checkbox" ' + (mockMergeTamgu ? 'checked' : '') + ' onchange="mkToggleMergeTamgu()" style="accent-color:#8b5cf6"> 탐구 2과목을 1과목으로 평균</label>' +
    '</div><div style="font-size:10.5px;color:var(--ink-3);margin-top:7px;line-height:1.6">' +
    '지망 대학의 수능 반영 영역에 맞춰 체크하면 평균등급·판정이 그 기준으로 다시 계산됩니다.</div></div>';
}
function mkToggleWeight(a) {
  if (mockWeight.has(a)) mockWeight.delete(a); else mockWeight.add(a);
  renderMockTab();
  if (document.getElementById('tab-fusion').style.display !== 'none') renderFusionTab();
}
function mkToggleMergeTamgu() { mockMergeTamgu = !mockMergeTamgu; renderMockTab(); }

// ── 회차별 성적표 ──
function mkScoreTableCard(series) {
  const areas = ME.AREAS.filter(a => series.some(e => e.subjects[a]));
  const groups = [
    { org: '교육청', rows: series.filter(e => e.org === '교육청'), title: '교육청 — 전국연합학력평가' },
    { org: '평가원', rows: series.filter(e => e.org === '평가원' || e.org === '수능'), title: '평가원 — 모의평가 · 수능' }
  ].filter(g => g.rows.length);

  // 인쇄에서 카드째 다음 쪽으로 밀리면 앞쪽이 비므로 카드는 쪽 사이에서 나뉘게 두고(print-split),
  // 회차 하나(4줄)는 tbody로 묶어 잘리지 않게 한다(.mk-exam).
  let html = '<div class="result-card print-split mk-score-card"><div class="result-title">' + ic('table', 17) + ' 회차별 성적표</div>' +
    '<div style="font-size:10.5px;color:var(--ink-3);margin-bottom:9px">화살표는 직전 회차 대비 변화입니다. 위로 향한 화살표가 좋아진 것입니다.</div>';

  for (const g of groups) {
    html += '<div class="mk-grp-h" style="font-size:11px;font-weight:900;color:var(--ink-2);margin:10px 0 5px">' + g.title + '</div>' +
      '<div style="overflow-x:auto"><table class="mk-table"><thead><tr><th style="width:34px"></th><th style="width:62px"></th>' +
      areas.map(a => '<th>' + mkAreaName(a, series) + '</th>').join('') + '</tr></thead>';

    for (const ex of g.rows) {
      html += '<tbody class="mk-exam">';
      const metrics = [
        { k: 'raw', l: '원점수' },
        { k: 'std', l: '표준점수' },
        { k: 'pct', l: '백분위' },
        { k: 'grade', l: '등급' }
      ];
      metrics.forEach((m, mi) => {
        html += '<tr>';
        if (mi === 0) html += '<td class="examhead ' + mkOrgClass(ex.org) + '" rowspan="4">' + mkEsc(ex.label.replace(/\s/g, '')) + '</td>';
        html += '<td class="rowhead">' + m.l + '</td>';
        for (const a of areas) {
          const s = ex.subjects[a];
          if (!s) { html += '<td style="color:var(--ink-3)">—</td>'; continue; }
          let v = s[m.k];
          if (v === null || v === undefined) { html += '<td style="color:var(--ink-3)">—</td>'; continue; }

          let cell = '<span class="num">' + (m.k === 'pct' ? mkFix(v, 1) : v) + '</span>';
          if (m.k === 'grade') {
            const d = ex.subjDelta && ex.subjDelta[a] ? ex.subjDelta[a].grade : null;
            cell = '<span class="grade-badge g' + Math.min(9, Math.round(v)) + '">' + v + '</span>' + mkDelta(d);
            if (s.sel) cell += '<span class="mk-sel">' + mkEsc(s.sel) + '</span>';
            if (s.gradeDerived) cell += '<span class="mk-sel" style="color:var(--accent)">산출</span>';
          } else if (m.k === 'pct') {
            const d = ex.subjDelta && ex.subjDelta[a] ? ex.subjDelta[a].pct : null;
            cell += mkDeltaPct(d);
          }
          html += '<td>' + cell + '</td>';
        }
        html += '</tr>';
      });
      html += '</tbody>';
    }
    html += '</table></div>';
  }
  return html + '</div>';
}

// ── 추이 차트 ──
function mkTrendCard() {
  // 내신 분석과 같은 배치 — 방사형이 왼쪽, 추이가 오른쪽
  return '<div class="dual-row">' +
    '<div class="result-card"><div class="result-title">' + ic('radar', 17) + ' 최근 회차 영역별 등급</div>' +
    '<div style="font-size:10.5px;color:var(--ink-3);margin-bottom:8px">바깥쪽일수록 좋은 등급입니다. 점에 적힌 숫자가 최근 회차 등급이고, 점선은 이전 회차입니다.</div>' +
    '<div class="radar-wrap"><canvas id="mk-radar"></canvas></div></div>' +
    '<div class="result-card"><div class="result-title">' + ic('trend', 17) + ' 영역별 등급 추이</div>' +
    '<div style="font-size:10.5px;color:var(--ink-3);margin-bottom:8px">위로 갈수록 좋은 등급입니다.</div>' +
    '<div class="chart-wrap"><canvas id="mk-trend"></canvas></div></div></div>';
}

function mkGradeAxis(title) {
  return {
    min: 0.5, max: 9.5,
    // 0.5~9.5 범위를 그대로 두면 Chart.js가 0.5 단위 눈금을 잡아 라벨이 비어버린다.
    // 1~9 정수 눈금으로 고정한다 (값은 10-등급이라 위로 갈수록 좋은 등급).
    afterBuildTicks: axis => { axis.ticks = [9, 8, 7, 6, 5, 4, 3, 2, 1].map(v => ({ value: v })); },
    ticks: {
      callback: v => (10 - v) + '등급',
      font: { size: 10, weight: '700' }
    },
    title: { display: !!title, text: title, font: { size: 10, weight: '800' } },
    grid: { color: mkCss('--line') }
  };
}

function mkBuildTrendChart(stu) {
  const cv = document.getElementById('mk-trend');
  if (!cv || typeof Chart === 'undefined') return;
  const cfg = mkTrendConfig(stu);
  if (!cfg) return;
  mkDestroyChart('trend');
  mkCharts.trend = new Chart(cv.getContext('2d'), cfg);
}

/** 영역별 등급 추이 — 화면과 인쇄용 PNG가 같은 설정을 쓴다.
 *  png: true 면 애니메이션을 끄고 제목을 넣는다(캔버스를 바로 떠내야 하므로). */
function mkTrendConfig(stu, opt) {
  opt = opt || {};
  const series = ME.examSeries(stu, mockWeight, mockMergeTamgu);
  if (!series.length) return null;
  const labels = series.map(e => e.label.replace(/\s/g, ''));
  const areas = ME.AREAS.filter(a => series.some(e => e.subjects[a] && e.subjects[a].grade !== null));

  const datasets = areas.map(a => ({
    label: mkAreaName(a, series),
    data: series.map(e => e.subjects[a] && e.subjects[a].grade !== null ? 10 - e.subjects[a].grade : null),
    borderColor: MK_AREA_COLOR[a] || '#64748b',
    backgroundColor: (MK_AREA_COLOR[a] || '#64748b') + '22',
    borderWidth: 2.5, tension: .3, pointRadius: 4, pointHoverRadius: 6, spanGaps: true
  }));
  // 주요과목 평균 (굵은 점선)
  datasets.push({
    label: '주요과목 평균',
    data: series.map(e => e.mainAvg !== null ? 10 - e.mainAvg : null),
    borderColor: mkCss('--ink'), borderDash: [6, 4], borderWidth: 3,
    pointRadius: 3, tension: .25, spanGaps: true
  });

  return {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: !opt.png, maintainAspectRatio: false, animation: opt.png ? false : undefined,
      devicePixelRatio: opt.png ? 2 : undefined,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: opt.png ? { display: true, text: '영역별 등급 추이', font: { size: 13, weight: '800' } } : undefined,
        legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 10, weight: '700' }, padding: 8 } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (10 - c.parsed.y).toFixed(2) + '등급' } }
      },
      scales: { y: mkGradeAxis(''), x: { ticks: { font: { size: 10, weight: '700' } }, grid: { display: false } } }
    }
  };
}

function mkBuildRadarChart(stu) {
  const cv = document.getElementById('mk-radar');
  if (!cv || typeof Chart === 'undefined') return;
  const cfg = mkRadarConfig(stu);
  if (!cfg) {
    cv.parentElement.innerHTML = '<div style="text-align:center;padding:30px;color:var(--ink-3);font-size:11.5px">영역이 3개 이상이어야 레이더를 그립니다.</div>';
    return;
  }
  mkDestroyChart('radar');
  mkCharts.radar = new Chart(cv.getContext('2d'), cfg);
}

/** 최근 회차 영역별 백분위 레이더 — 화면·인쇄 공용 설정 */
function mkRadarConfig(stu, opt) {
  opt = opt || {};
  const series = ME.examSeries(stu, mockWeight, mockMergeTamgu);
  if (!series.length) return null;
  const recent = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const areas = ME.AREAS.filter(a => recent.subjects[a]);
  if (areas.length < 3) return null;

  // 백분위보다 등급이 직관적이라 등급으로 그린다(내신 방사형과 동일).
  // 축은 10 - 등급이라 바깥쪽이 좋은 등급이 된다.
  const gradeOf = (ex, a) => {
    const s = ex.subjects[a];
    return (s && s.grade !== null && s.grade !== undefined) ? s.grade : null;
  };
  const axis = g => (g === null ? null : 10 - g);

  const gRecent = areas.map(a => gradeOf(recent, a));
  const ds = [{
    label: recent.label.replace(/\s/g, ''),
    data: gRecent.map(axis),
    _raw: gRecent,                       // radarLabelPlugin이 점 옆에 찍을 실제 등급
    borderColor: mkCss('--accent'), backgroundColor: mkCss('--accent', .18),
    borderWidth: 2.5, pointRadius: 4.5, pointHoverRadius: 8,
    pointBackgroundColor: mkCss('--accent'), pointBorderColor: '#ffffff', pointBorderWidth: 1.5
  }];
  if (prev) {
    const gPrev = areas.map(a => gradeOf(prev, a));
    ds.push({
      label: prev.label.replace(/\s/g, ''),
      data: gPrev.map(axis),
      borderColor: mkCss('--ink-3'), backgroundColor: mkCss('--ink-3', .10),
      borderWidth: 2, borderDash: [5, 4], pointRadius: 2.5
    });
  }
  // 그 앞 회차(예: 3월)는 가장 옅은 점선으로 — 출발점만 보이면 된다
  const older = series.length > 2 ? series[series.length - 3] : null;
  if (older) {
    ds.push({
      label: older.label.replace(/\s/g, ''),
      data: areas.map(a => gradeOf(older, a)).map(axis),
      borderColor: mkCss('--ink-3', .55), backgroundColor: 'transparent',
      borderWidth: 1.5, borderDash: [2, 3], pointRadius: 2,
      pointBackgroundColor: mkCss('--ink-3', .55), pointBorderWidth: 0
    });
  }

  return {
    type: 'radar',
    plugins: (typeof radarLabelPlugin === 'object' && radarLabelPlugin) ? [radarLabelPlugin] : [],
    data: { labels: areas.map(a => { const s = recent.subjects[a]; return s && s.sel ? s.sel : a; }), datasets: ds },
    options: {
      responsive: !opt.png, maintainAspectRatio: false, animation: opt.png ? false : undefined,
      devicePixelRatio: opt.png ? 2 : undefined,
      plugins: {
        title: opt.png ? { display: true, text: '최근 회차 영역별 등급', font: { size: 13, weight: '800' } } : undefined,
        // 데이터셋은 최근 회차가 맨 위에 그려지도록 최근→과거 순이다. 범례는 시간 순(3월→9월)으로 뒤집는다.
        legend: { position: 'bottom', reverse: true, labels: { boxWidth: 11, font: { size: 10, weight: '700' } } },
        // 점 옆의 숫자는 최근 회차만 찍는다(두 겹이면 읽기 어렵다)
        radarGradeLabel: { size: 10.5, color: mkCss('--accent') },
        tooltip: { callbacks: { label: c => c.dataset.label + ' ' + (10 - c.parsed.r) + '등급' } }
      },
      scales: {
        r: {
          min: 0.5, max: 9.5, beginAtZero: false,
          // 1~9 정수 눈금만 쓰고, 라벨은 위아래 끝만 남겨 숫자와 겹치지 않게 한다
          afterBuildTicks: ax => { ax.ticks = [9, 8, 7, 6, 5, 4, 3, 2, 1].map(v => ({ value: v })); },
          ticks: {
            stepSize: 1, font: { size: 9 }, color: mkCss('--ink-3'),
            backdropColor: 'transparent', showLabelBackdrop: false,
            callback: v => (v === 9 || v === 1) ? (10 - v) + '등급' : ''
          },
          pointLabels: { padding: 3, font: { size: 11, weight: '800' }, color: mkCss('--ink-2') },
          grid: { color: mkCss('--line') },
          angleLines: { color: mkCss('--line') }
        }
      }
    }
  };
}

// ── 진단 ──
function mkDiagnosisCard(stu) {
  const dg = ME.diagnoseSubjects(stu, { weightSet: mockWeight, mergeTamgu: mockMergeTamgu });
  if (!dg.items.length) return '';

  const rows = dg.items.slice().sort((a, b) => (a.grade === null ? 99 : a.grade) - (b.grade === null ? 99 : b.grade)).map(it => {
    const tag = it.tag === 'strong' ? '<span class="mk-tag strong">강점</span>'
      : (it.tag === 'weak' ? '<span class="mk-tag weak">보완</span>' : '');
    const tr = it.trend === null ? '<span style="color:var(--ink-3)">—</span>'
      : (it.trend < -0.1 ? '<span class="mk-d up">' + ic('arrowUp', 10) + ' 상승</span>'
        : (it.trend > 0.1 ? '<span class="mk-d down">' + ic('arrowDown', 10) + ' 하락</span>' : '<span class="mk-d same">유지</span>'));
    const head = ME.areaLabel(it.area, dg.recent);
    return '<tr><td class="rowhead">' + mkEsc(head) + (it.name !== head ? '<span class="mk-sel">' + mkEsc(it.name) + '</span>' : '') + '</td>' +
      '<td><span class="grade-badge g' + Math.min(9, Math.round(it.grade || 9)) + '">' + (it.grade === null ? '-' : it.grade) + '</span>' + tag + '</td>' +
      '<td class="num">' + (it.pct === null ? '—' : mkFix(it.pct, 1)) + '</td>' +
      '<td class="num">' + (it.best === null ? '—' : it.best + ' / ' + it.worst) + '</td>' +
      '<td>' + tr + '</td></tr>';
  }).join('');

  const notes = dg.notes.map(n => '<li>' + mkEsc(n) + '</li>').join('');

  return '<div class="result-card"><div class="result-title">' + ic('lens', 17) + ' 영역별 강약 진단</div>' +
    '<div style="overflow-x:auto"><table class="mk-table"><thead><tr><th>영역</th><th>최근 등급</th><th>백분위</th><th>최고/최저</th><th>추세</th></tr></thead><tbody>' +
    rows + '</tbody></table></div>' +
    (notes ? '<ul class="mk-reasons" style="margin-top:10px">' + notes + '</ul>' : '') + '</div>';
}

// ═══════════════════════════════════════════════
// 학급 대시보드
// ═══════════════════════════════════════════════
function mkClassSection() {
  const keys = ME.allExamKeys(mockStudents);
  if (!keys.length) return '';
  if (!mockDashKey || keys.indexOf(mockDashKey) < 0) mockDashKey = keys[keys.length - 1];
  const idx = keys.indexOf(mockDashKey);
  const prevKey = idx > 0 ? keys[idx - 1] : null;

  const picker = '<select onchange="mkSetDashKey(this.value)" style="padding:4px 8px;border-radius:7px;border:1.5px solid var(--line);background:var(--paper);color:var(--ink);font-size:11px;font-weight:800;font-family:inherit">' +
    keys.map(k => { const m = ME.examMetaOf(mockStudents, k); return '<option value="' + k + '"' + (k === mockDashKey ? ' selected' : '') + '>' + m.year + ' ' + mkEsc(m.label) + '</option>'; }).join('') +
    '</select>';

  let html = '<div class="result-card" style="border-color:#c4b5fd;background:linear-gradient(135deg,#faf5ff,var(--paper))">' +
    '<div class="result-title" style="color:#6d28d9;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
    ic('users', 17) + ' 학급 대시보드 ' + picker + '</div>' +
    '<div style="font-size:10.5px;color:var(--ink-3)">학생을 선택하지 않아도 볼 수 있습니다. 회차를 바꾸면 아래 카드가 모두 갱신됩니다.</div></div>';

  html += mkMoversCard(prevKey);
  html += mkDistCard();
  return html;
}

function mkSetDashKey(k) { mockDashKey = k; renderMockTab(); }
function mkSetMoverTh(v) { mockMoverTh = parseInt(v, 10) || 3; renderMockTab(); }

// ── 급락 / 급상승 ──
function mkMoversCard(prevKey) {
  if (!prevKey) {
    return '<div class="result-card"><div class="result-title">' + ic('alert', 17) + ' 등급 급락 · 급상승</div>' +
      '<div class="mk-banner warn">회차가 2개 이상이어야 변동을 계산할 수 있습니다. 직전 회차를 함께 올려주세요.</div></div>';
  }
  const mv = ME.findMovers(mockStudents, mockDashKey, prevKey, mockMoverTh, mockWeight);
  const prevMeta = ME.examMetaOf(mockStudents, prevKey);
  const curMeta = ME.examMetaOf(mockStudents, mockDashKey);

  const row = (it, dir) => {
    const dt = it.detail.slice(0, 3).map(d => mkAreaName(d.area, [curMeta, prevMeta]) + ' ' + d.from + '→' + d.to).join(' · ');
    return '<div class="mk-mrow"><span class="nm">' + mkEsc(it.name) + '</span>' +
      // sumDelta는 등급 숫자 합의 변화라 좋아지면 음수다. 보는 사람 감각에 맞춰
      // 좋아진 폭은 +, 떨어진 폭은 −로 뒤집어 보여준다 (엔진 값은 그대로).
      '<span class="sum" style="color:' + (dir === 'up' ? '#0f766e' : '#be123c') + '">' +
      (it.sumDelta < 0 ? '+' + (-it.sumDelta) : (it.sumDelta > 0 ? '−' + it.sumDelta : '0')) + '</span>' +
      '<span class="dt">' + mkEsc(dt) + '</span></div>';
  };

  const thSel = '<select onchange="mkSetMoverTh(this.value)" style="padding:3px 6px;border-radius:6px;border:1.5px solid var(--line);background:var(--paper);color:var(--ink);font-size:10.5px;font-weight:800;font-family:inherit">' +
    [2, 3, 4, 5, 6].map(v => '<option value="' + v + '"' + (v === mockMoverTh ? ' selected' : '') + '>±' + v + '등급</option>').join('') + '</select>';

  return '<div class="result-card"><div class="result-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
    ic('alert', 17) + ' 등급 급락 · 급상승 ' + thSel +
    '<span style="font-size:10.5px;font-weight:700;color:var(--ink-3)">' + mkEsc(prevMeta.label) + ' → ' + mkEsc(ME.examMetaOf(mockStudents, mockDashKey).label) + ' · 반영 과목 등급합 기준 · <b style="color:#0f766e">+</b>는 좋아진 등급 수, <b style="color:#be123c">−</b>는 떨어진 등급 수</span></div>' +
    '<div class="mk-movers">' +
    '<div class="mk-mbox up"><h4>' + ic('arrowUp', 15) + ' 등급 상승 (' + mv.up.length + '명)</h4>' +
    (mv.up.length ? mv.up.map(i => row(i, 'up')).join('') : '<div style="font-size:10.5px;color:var(--ink-3);padding:4px">해당 학생이 없습니다.</div>') + '</div>' +
    '<div class="mk-mbox down"><h4>' + ic('arrowDown', 15) + ' 등급 급락 (' + mv.down.length + '명)</h4>' +
    (mv.down.length ? mv.down.map(i => row(i, 'down')).join('') : '<div style="font-size:10.5px;color:var(--ink-3);padding:4px">해당 학생이 없습니다.</div>') + '</div>' +
    '</div></div>';
}

// ── 전국 대비 분포 ──
/** 지금 올라와 있는 학생이 한 반인지 여러 반인지에 따라 부르는 이름을 맞춘다.
 *  (한 반만 올렸는데 "교내"라고 하면 앞뒤가 안 맞는다) */
function mkScopeLabel() {
  const set = new Set();
  for (const stu of Object.values(mockStudents)) {
    if (stu.meta && stu.meta.cls) set.add(String(stu.meta.cls));
  }
  if (set.size === 1) return { short: '우리 반', long: [...set][0] + '반' };
  if (set.size > 1) return { short: '올린 학생', long: set.size + '개 반 전체' };
  return { short: '올린 학생', long: '올린 학생' };
}

function mkDistCard() {
  const cs = ME.classMockStats(mockStudents, mockDashKey);
  const areas = Object.keys(cs.bySubject);
  if (!areas.length) return '';

  const area = mkDistArea && cs.bySubject[mkDistArea] ? mkDistArea : areas[0];
  mkDistArea = area;
  const b = cs.bySubject[area];
  const sc = mkScopeLabel();

  // 과목 선택은 누를 수 있다는 게 한눈에 보여야 한다
  const chips = areas.map(a => {
    const st = cs.bySubject[a];
    const nm = (a.indexOf('탐구') === 0 && st.sel) ? st.sel : mkAreaName(a, ME.examMetaOf(mockStudents, mockDashKey));
    return '<button class="pickchip' + (a === area ? ' on' : '') + '" onclick="mkSetDistArea(\'' + a + '\')">' +
      mkEsc(nm) + '<span class="n">' + mkFix(st.avg) + '</span></button>';
  }).join('');

  const rows = b.ratio.map((r, i) =>
    '<tr><td class="rowhead" style="text-align:center"><span class="grade-badge g' + (i + 1) + '">' + (i + 1) + '</span></td>' +
    '<td class="num">' + b.dist[i] + '명</td><td class="num">' + r + '%</td>' +
    '<td class="num" style="color:var(--ink-3)">' + ME.NATIONAL_RATIO[i] + '%</td>' +
    '<td class="num" style="font-weight:800;color:' +
      (b.deviation[i] > 0 ? 'var(--good)' : (b.deviation[i] < 0 ? 'var(--bad)' : 'var(--ink-3)')) + '">' +
    (b.deviation[i] > 0 ? '+' : '') + b.deviation[i] + '%p</td></tr>'
  ).join('');

  const conc = b.concentration;
  const concColor = conc === null ? 'var(--ink-3)' : (conc >= 1.2 ? 'var(--good)' : (conc >= 0.8 ? 'var(--warn)' : 'var(--bad)'));

  return '<div class="result-card">' +
    '<div class="result-title">' + ic('grid', 17) + ' 전국 대비 ' + sc.short + ' 분포</div>' +
    '<div class="card-sub">' + sc.long + ' ' + b.n + '명을 전국 기준과 견줍니다. 아래에서 영역을 골라 보세요.</div>' +
    '<div class="pickrow">' + chips + '</div>' +
    '<div class="mk-banner info">전국 기준선은 9등급제 <b>이론 비율</b>(4·7·12·17·20·17·12·7·4%)입니다. 실제 전국 분포와는 차이가 있을 수 있습니다.</div>' +
    '<div class="chart-wrap" style="height:236px"><canvas id="mk-dist"></canvas></div>' +
    '<div class="mk-kpi" style="margin:14px 0">' +
    '<div class="mk-tile"><div class="t">응시 인원</div><div class="v" style="color:var(--ink)">' + b.n + '<span class="u">명</span></div><div class="s">' + sc.long + '</div></div>' +
    '<div class="mk-tile"><div class="t">평균등급</div><div class="v" style="color:var(--warn)">' + mkFix(b.avg) + '</div><div class="s">낮을수록 우수</div></div>' +
    '<div class="mk-tile"><div class="t">1~2등급 비율</div><div class="v" style="color:var(--accent)">' + b.top2Ratio + '<span class="u">%</span></div><div class="s">전국 기준 11%</div></div>' +
    '<div class="mk-tile"><div class="t">상위권 집중도</div><div class="v" style="color:' + concColor + '">' + (conc === null ? '-' : conc) + '<span class="u">x</span></div><div class="s">1.0x = 전국 평균 수준</div></div>' +
    '</div>' +
    '<div class="tbl-wrap"><table class="mk-table"><thead><tr><th>등급</th><th>' + sc.short + ' 인원</th><th>' + sc.short + ' %</th><th>전국 %</th><th>편차</th></tr></thead><tbody>' +
    rows + '</tbody></table></div></div>';
}
let mkDistArea = null;
function mkSetDistArea(a) { mkDistArea = a; renderMockTab(); }

function mkBuildDistChart() {
  const cv = document.getElementById('mk-dist');
  if (!cv || typeof Chart === 'undefined' || !mockDashKey) return;
  const cs = ME.classMockStats(mockStudents, mockDashKey);
  const b = cs.bySubject[mkDistArea];
  if (!b) return;

  mkDestroyChart('dist');
  mkCharts.dist = new Chart(cv.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['1등급', '2등급', '3등급', '4등급', '5등급', '6등급', '7등급', '8등급', '9등급'],
      datasets: [
        { label: mkScopeLabel().short + ' %', data: b.ratio, backgroundColor: mkCss('--accent', .55), borderColor: mkCss('--accent'), borderWidth: 1.5, borderRadius: 5, order: 2 },
        { label: '전국 기준 %', data: ME.NATIONAL_RATIO, type: 'line', borderColor: mkCss('--warn'), backgroundColor: mkCss('--warn', .1), borderWidth: 2.5, pointRadius: 3.5, tension: .35, order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 10, weight: '700' } } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + '%', font: { size: 10 } }, grid: { color: mkCss('--line') } },
        x: { ticks: { font: { size: 10, weight: '700' } }, grid: { display: false } }
      }
    }
  });
}

// ═══════════════════════════════════════════════
// 탭 ③ 수시 · 정시 통합
// ═══════════════════════════════════════════════
function renderFusionTab() {
  const wrap = document.getElementById('tab-fusion');
  const name = currentStudent;

  const teacherOnly = '<div class="mk-teacher-only">' + ic('lock', 15) +
    '<div><b>교사용 화면입니다. 인쇄되지 않습니다.</b>' +
    '<span>「정시 우위」만 보고 학교생활을 내려놓는 판단으로 이어질 수 있어, ' +
    '이 탭은 상담 중에 선생님이 보는 용도로만 둡니다.</span></div></div>';

  if (!name) {
    // 학생을 고르기 전에도 반 전체 성향 지도는 볼 수 있다
    const cls = mkClassTrackCard(null);
    wrap.innerHTML = cls
      ? teacherOnly + cls + '<div class="result-card">' + mkEmpty('target', '학생을 고르면 개인 판정이 나옵니다', '지도의 점이나 이름을 누르거나 왼쪽 <b>2번 학생 선택</b>에서 고르세요.') + '</div>'
      : mkEmpty('target', '학생을 선택하세요', '왼쪽 <b>2번 학생 선택</b>에서 학생을 고르면 수시·정시 성향 판정이 나옵니다.');
    if (cls) mkBuildClassTrackCharts(null);
    return;
  }
  const hasNaesin = !!(allStudents && allStudents[name]);
  const hasMock = !!mockStudents[name];

  if (!hasNaesin || !hasMock) {
    wrap.innerHTML = mkEmpty('scale', '두 성적이 모두 필요합니다',
      '수시·정시 판정은 <b>내신</b>과 <b>모의고사</b>를 함께 비교합니다.<br><br>' +
      '현재 ' + mkEsc(name) + ' 학생: 내신 ' + (hasNaesin ? '있음' : '없음') + ' · 모의고사 ' + (hasMock ? '있음' : '없음') +
      (hasNaesin && !hasMock ? '<br><br><span style="color:var(--accent);font-weight:800">모의고사 파일의 이름 표기가 내신과 다르면 다른 학생으로 인식됩니다. 이름을 확인해주세요.</span>' : ''));
    return;
  }

  const n9 = naesinAvg9For(name);
  const judged = ME.judgeTrack(n9, mockStudents[name], {
    weightSet: mockWeight, mergeTamgu: mockMergeTamgu, naesinTrend: naesinTrend9(name)
  });

  let html = teacherOnly;
  html += mkJudgeCard(name, judged);
  html += mkVsCard(name, judged);
  html += mkLineCard(judged);
  html += mkFitCard(judged);
  html += mkClassTrackCard(name);

  wrap.innerHTML = html;
  mkBuildVsChart(name);
  mkBuildClassTrackCharts(name);
  mkPlayGauge();
}

// ── 판정 카드 ──
function mkJudgeCard(name, j) {
  if (j.incomplete) {
    return '<div class="result-card">' + mkEmpty('alert', '판정할 수 없습니다', j.reasons.map(mkEsc).join('<br>')) + '</div>';
  }
  const t = j.track;
  // Δ -3 ~ +3 을 0~100%로
  const pin = Math.min(97, Math.max(3, 50 + (j.delta / 3) * 50));

  // 핀은 가운데(50%)에서 출발해 mkPlayGauge()가 data-to 위치로 옮긴다
  return '<div class="result-card"><div class="result-title">' + ic('target', 17) + ' ' + mkEsc(name) + ' · 수시 · 정시 성향 판정' +
    '<button class="mk-replay" onclick="mkPlayGauge()" title="판정 애니메이션 다시 보기">' + ic('refresh', 12) + ' 다시 보기</button></div>' +
    '<div class="mk-judge anim" style="border-color:' + t.color + ';background:linear-gradient(135deg,' + t.color + '14,var(--paper))">' +
    '<div class="icon">' + ic(t.icon, 34) + '</div>' +
    '<div class="label" style="color:' + t.color + '">' + t.label + '</div>' +
    '<div class="sub">내신 ' + mkFix(j.naesin9) + '등급 · 모의 ' + mkFix(j.mockAvg) + '등급 (9등급 기준) · 격차 ' +
    (j.delta > 0 ? '+' : '') + mkFix(j.delta) + '</div>' +
    '<div class="mk-gauge"><div class="bar"></div><div class="mid"></div>' +
    '<div class="pin" style="left:50%;color:' + t.color + '" data-to="' + pin.toFixed(1) + '">' + ic('pin', 15) + '</div>' +
    '<div class="cap l">수시 우위</div><div class="cap r">정시 우위</div></div>' +
    '</div>' +
    '<ul class="mk-reasons">' + j.reasons.map(r => '<li>' + mkEsc(r) + '</li>').join('') + '</ul>' +
    '<div class="mk-banner warn" style="margin-top:10px;margin-bottom:0">판정은 평균등급 격차에 기반한 <b>참고 지표</b>입니다. 실제 지원은 학생부 교과 이수 내용, 비교과, 지망 계열, 대학별 전형 요소를 함께 고려해야 합니다.</div>' +
    '</div>';
}

// ── 내신 vs 모의 대비 ──
function mkVsCard(name, j) {
  const terms = naesinTermAvg9(name);
  const better = j.delta === null ? null : (j.delta > 0 ? 'm' : (j.delta < 0 ? 'n' : null));

  return '<div class="result-card"><div class="result-title">' + ic('scale', 17) + ' 내신 vs 모의고사 대비</div>' +
    '<div class="mk-vs">' +
    '<div class="side n"><div class="t">' + ic('file', 13) + ' 내신 (9등급 환산)</div><div class="v" style="color:' + (better === 'n' ? 'var(--good)' : 'var(--ink)') + '">' + mkFix(j.naesin9) + '</div><div class="s">' + terms.length + '개 학기 평균</div></div>' +
    '<div class="mid">VS</div>' +
    '<div class="side m"><div class="t">' + ic('trend', 13) + ' 모의고사 (주요과목)</div><div class="v" style="color:' + (better === 'm' ? 'var(--accent)' : 'var(--ink)') + '">' + mkFix(j.mockAvg) + '</div><div class="s">' + j.series.length + '개 회차 중 최근</div></div>' +
    '</div>' +
    '<div class="chart-wrap" style="height:260px"><canvas id="mk-vs"></canvas></div>' +
    '<div style="font-size:10.5px;color:var(--ink-3);margin-top:8px;line-height:1.65">' +
    '내신은 학기별 평균을 9등급으로 환산한 값이고(고1·2 5등급제는 백분위를 9등급 커트에 대입), 모의고사는 회차별 반영 과목 평균등급입니다. 두 선이 벌어질수록 한쪽 전형이 유리합니다.</div>' +
    '</div>';
}

function mkBuildVsChart(name) {
  const cv = document.getElementById('mk-vs');
  if (!cv || typeof Chart === 'undefined') return;
  const terms = naesinTermAvg9(name);
  const series = ME.examSeries(mockStudents[name], mockWeight, mockMergeTamgu);

  // 두 축을 하나의 시간축에 올린다 (학기 → 회차 순으로 이어붙이지 않고 각자 위치)
  const labels = [];
  terms.forEach(t => labels.push(t.term.replace('학년 ', '-')));
  series.forEach(e => labels.push(e.label.replace(/\s/g, '')));

  const nData = terms.map(t => 10 - t.avg).concat(series.map(() => null));
  const mData = terms.map(() => null).concat(series.map(e => e.mainAvg !== null ? 10 - e.mainAvg : null));

  mkDestroyChart('vs');
  mkCharts.vs = new Chart(cv.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: '내신 (9등급 환산)', data: nData, borderColor: mkCss('--good'), backgroundColor: mkCss('--good', .12), borderWidth: 3, pointRadius: 4.5, tension: .3, fill: true, spanGaps: false },
        { label: '모의고사 (주요과목 평균)', data: mData, borderColor: mkCss('--accent'), backgroundColor: mkCss('--accent', .12), borderWidth: 3, pointRadius: 4.5, tension: .3, fill: true, spanGaps: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 10.5, weight: '700' } } },
        tooltip: { callbacks: { label: c => c.parsed.y === null ? '' : c.dataset.label + ': ' + (10 - c.parsed.y).toFixed(2) + '등급' } }
      },
      scales: { y: mkGradeAxis(''), x: { ticks: { font: { size: 9.5, weight: '700' } }, grid: { display: false } } }
    }
  });
}

// ── 정시 라인 ──
function mkLineCard(j) {
  const recent = j.series[j.series.length - 1];
  const est = ME.estimateJeongsiLine(recent, MOCK_UNIV_LINES);
  if (!est) {
    return '<div class="result-card"><div class="result-title">' + ic('target', 17) + ' 정시 지원 가능 라인 (참고용)</div>' +
      '<div class="mk-banner warn" style="margin:0">국·수·영·탐 중 3개 영역 이상의 백분위가 있어야 추정할 수 있습니다.</div></div>';
  }
  return '<div class="result-card"><div class="result-title">' + ic('target', 17) + ' 정시 지원 가능 라인 (참고용)</div>' +
    '<div class="mk-line">' +
    '<div><div style="font-size:10px;font-weight:800;color:var(--ink-3)">국수영탐 백분위 평균</div><div class="pct">' + est.pctAvg + '</div></div>' +
    '<div style="flex:1;min-width:180px"><div class="grp">' + mkEsc(est.line.group) + '</div><div class="ex">' + mkEsc(est.line.example) + '</div>' +
    (est.upper ? '<div class="ex" style="margin-top:5px;color:var(--accent);font-weight:800">백분위 ' + est.gapToUpper + '점만 더 올리면 「' + mkEsc(est.upper.group) + '」 권으로 진입합니다.</div>' : '') +
    '</div></div>' +
    (est.verified
      ? '<div class="mk-banner warn" style="margin:10px 0 0">' + mkEsc(est.disclaimer) +
        '<br>기준표 기준일: ' + mkEsc(est.updated) + '</div>'
      : '<div class="mk-banner warn" style="margin:10px 0 0">' +
        '<b>이 대학군 표는 아직 실제 입결로 갱신하지 않은 기본값입니다.</b> ' + mkEsc(est.source) +
        '<br>' + mkEsc(est.disclaimer) +
        '<br>갱신하는 곳: 어디가(adiga.kr) → 「평가기준 및 입시결과」의 정시 최종등록자 70%컷 평균 백분위. ' +
        '공개 API가 없어 자동 연동은 되지 않습니다.</div>') +
    '</div>';
}

// ── 전형 적합도 ──
function mkFitCard(j) {
  const n = j.naesin9, m = j.mockAvg, d = j.delta;
  const clamp = v => Math.min(100, Math.max(0, v));
  // 등급이 좋을수록(숫자가 작을수록) 점수가 높다. 1등급=100, 6등급=0 기준
  const gScore = g => clamp((6 - g) / 5 * 100);

  const fits = [
    {
      nm: '교과전형 (수시)', c: '#0d9488',
      v: clamp(gScore(n) * 0.85 + (d > 0 ? 0 : Math.min(15, -d * 8))),
      cm: '내신 정량 평가가 핵심입니다. ' + (n <= 2.5 ? '내신이 강해 주력으로 삼을 만합니다.' : '내신 경쟁력을 감안해 수능 최저가 있는 전형을 노려보세요.')
    },
    {
      nm: '학생부종합 (수시)', c: '#0ea5e9',
      v: clamp(gScore(n) * 0.7 + 18),
      cm: '내신에 더해 세특·활동의 일관성이 중요합니다. 정량 지표만으로는 판단이 어려워 보수적으로 표시합니다.'
    },
    {
      nm: '논술 (수시)', c: '#f59e0b',
      v: clamp(gScore(m) * 0.75 + (d > 0 ? Math.min(20, d * 10) : 0)),
      cm: '내신 반영이 작고 수능 최저가 걸리는 경우가 많아, ' + (d > 0 ? '모의가 앞서는 이 학생에게 활로가 됩니다.' : '수능 최저 충족 여부가 관건입니다.')
    },
    {
      nm: '정시 (수능)', c: '#8b5cf6',
      v: clamp(gScore(m) * 0.95 + (d > 0 ? Math.min(10, d * 5) : 0)),
      cm: '수능 성적만 반영합니다. ' + (m <= 3 ? '현재 경쟁력이 있어 비중을 키울 만합니다.' : '남은 기간 성적 상승 폭이 관건입니다.')
    }
  ];

  const cards = fits.map(f => {
    const lv = f.v >= 70 ? '유리' : (f.v >= 45 ? '보통' : '불리');
    return '<div class="mk-fit"><div class="nm">' + f.nm +
      '<span class="score" style="background:' + f.c + '">' + lv + ' ' + Math.round(f.v) + '</span></div>' +
      '<div class="meter"><i style="width:' + f.v + '%;background:' + f.c + '"></i></div>' +
      '<div class="cm">' + mkEsc(f.cm) + '</div></div>';
  }).join('');

  return '<div class="result-card"><div class="result-title">' + ic('layers', 17) + ' 전형별 적합도 (참고 지표)</div>' +
    '<div class="mk-quad">' + cards + '</div>' +
    '<div class="mk-banner warn" style="margin:10px 0 0">적합도는 내신·모의 평균등급만으로 계산한 <b>개략 지표</b>입니다. 학종은 정량화가 어려워 보수적으로 산출했습니다. 실제 전형 선택은 대학별 모집요강과 학생부 내용을 함께 검토하세요.</div>' +
    '</div>';
}

// ═══════════════════════════════════════════════
// 첫 회차 → 최근 회차 변화 요약
// ═══════════════════════════════════════════════
function mkSpark(vals) {
  // 등급 흐름 미니 그래프 (위가 좋은 등급). 값이 1개뿐이면 그리지 않는다.
  const pts = vals.map((v, i) => ({ i: i, v: v })).filter(p => typeof p.v === 'number');
  if (pts.length < 2) return '';
  const W = 64, H = 22, pad = 3;
  const x = i => pad + (vals.length === 1 ? 0 : i / (vals.length - 1)) * (W - pad * 2);
  const y = v => pad + ((v - 1) / 8) * (H - pad * 2);
  const d = pts.map((p, k) => (k ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return '<svg class="mk-spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">' +
    '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + x(last.i).toFixed(1) + '" cy="' + y(last.v).toFixed(1) + '" r="2.4" fill="currentColor"/></svg>';
}

function mkChangeCard(series) {
  if (series.length < 2) return '';
  const first = series[0], last = series[series.length - 1];
  const items = ME.AREAS.map(a => {
    const f = first.subjects[a], l = last.subjects[a];
    if (!f || !l || f.grade === null || l.grade === null) return null;
    return {
      a: a, name: l.sel || a, from: f.grade, to: l.grade, d: l.grade - f.grade,
      pd: (f.pct !== null && l.pct !== null && !f.pctDerived && !l.pctDerived) ? ME.round(l.pct - f.pct, 1) : null,
      path: series.map(e => e.subjects[a] ? e.subjects[a].grade : null)
    };
  }).filter(Boolean);
  if (!items.length) return '';

  const up = items.filter(i => i.d < 0).length, down = items.filter(i => i.d > 0).length;
  const avgD = (first.mainAvg !== null && last.mainAvg !== null) ? ME.round(last.mainAvg - first.mainAvg, 2) : null;
  const star = items.slice().sort((x, y) => x.d - y.d || (y.pd || 0) - (x.pd || 0))[0];

  const tiles = items.map(i => {
    const cls = i.d < 0 ? 'up' : (i.d > 0 ? 'down' : 'same');
    const badge = i.d < 0 ? ic('arrowUp', 11) + ' ' + (-i.d) + '등급'
      : (i.d > 0 ? ic('arrowDown', 11) + ' ' + i.d + '등급' : '유지');
    return '<div class="mk-chg ' + cls + (i === star && i.d < 0 ? ' star' : '') + '">' +
      '<div class="nm">' + mkEsc(i.name) + '</div>' +
      '<div class="gr"><span class="f">' + i.from + '</span>' + ic('chevRight', 13) + '<span class="t">' + i.to + '</span><span class="u">등급</span></div>' +
      '<div class="ft"><span class="bd">' + badge + '</span>' + mkSpark(i.path) + '</div>' +
      (i.pd !== null ? '<div class="pd">백분위 ' + (i.pd > 0 ? '+' : '') + i.pd + '</div>' : '') +
      '</div>';
  }).join('');

  const head = avgD === null ? '' :
    '<div class="mk-chg-head"><b>' + mkEsc(first.label) + ' → ' + mkEsc(last.label) + '</b> 주요과목 평균 ' +
    mkFix(first.mainAvg) + ' → ' + mkFix(last.mainAvg) + '등급 ' +
    (avgD < 0 ? '<span class="mk-d up">' + ic('arrowUp', 10) + ' ' + Math.abs(avgD).toFixed(2) + ' 개선</span>'
      : (avgD > 0 ? '<span class="mk-d down">' + ic('arrowDown', 10) + ' ' + avgD.toFixed(2) + ' 하락</span>' : '<span class="mk-d same">변화 없음</span>')) +
    '<span class="cnt">오른 영역 ' + up + ' · 내린 영역 ' + down + '</span></div>';

  return '<div class="result-card"><div class="result-title">' + ic('pulse', 17) + ' 첫 회차 → 최근 회차 변화</div>' +
    head + '<div class="mk-chg-grid">' + tiles + '</div>' +
    (star && star.d < 0 ? '<div class="mk-banner info" style="margin:10px 0 0">가장 많이 오른 영역은 <b>' + mkEsc(star.name) + '</b>입니다 (' +
      star.from + '등급 → ' + star.to + '등급). 상담에서 먼저 칭찬할 거리로 쓰기 좋습니다.</div>' : '') +
    '</div>';
}

// ═══════════════════════════════════════════════
// 수능 최저 충족 시뮬레이터
// ═══════════════════════════════════════════════
const MK_CSAT_PRESETS = [[2, 4], [2, 5], [2, 6], [3, 6], [3, 7], [3, 8], [3, 9], [4, 10]];
let mkCsatK = 3, mkCsatSum = 7, mkCsatTamguAvg = false;
function mkSetCsat(k, s) { if (k) mkCsatK = parseInt(k, 10); if (s) mkCsatSum = parseInt(s, 10); renderMockTab(); }
function mkToggleCsatTamgu() { mkCsatTamguAvg = !mkCsatTamguAvg; renderMockTab(); }

function mkCsatPathText(p) {
  return p.map(s => mkEsc(s.area) + ' ' + s.from + '→' + s.to).join(' + ');
}

function mkCsatRow(exam, k, t, custom) {
  const r = ME.csatMinCheck(exam, k, t, { tamguAvg: mkCsatTamguAvg });
  const label = custom
    ? '<select onchange="mkSetCsat(this.value)">' + [2, 3, 4].map(v => '<option value="' + v + '"' + (v === k ? ' selected' : '') + '>' + v + '개</option>').join('') + '</select>' +
      ' 합 <select onchange="mkSetCsat(0,this.value)">' + Array.from({ length: 14 }, (_, i) => i + 3).map(v => '<option value="' + v + '"' + (v === t ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>'
    : '<b>' + k + '개 합 ' + t + '</b>';
  if (!r) return '<tr' + (custom ? ' class="custom"' : '') + '><td class="rowhead">' + label + '</td><td colspan="3" style="color:var(--ink-3)">영역이 부족해 계산할 수 없습니다.</td></tr>';

  const status = r.ok
    ? '<span class="mk-csat-st ok">' + ic('check', 11) + ' 충족</span>'
    : '<span class="mk-csat-st ' + (r.short === 1 ? 'near' : 'no') + '">' + (r.short === 1 ? '한 등급 차' : r.short + '등급 부족') + '</span>';
  // 멀리 떨어진 기준은 대안을 여러 개 늘어놓아도 읽히지 않는다 — 가장 현실적인 길 하나만
  const shown = r.short >= 3 ? r.paths.slice(0, 1) : r.paths;
  const how = r.ok
    ? (r.spare ? '여유 ' + r.spare + '등급 — 한 영역이 ' + r.spare + '등급 떨어져도 버팁니다.' : '딱 맞습니다. 한 영역만 떨어져도 미충족입니다.')
    : (shown.length ? shown.map((p, i) => '<span class="mk-csat-path' + (i ? ' alt' : '') + '">' + mkCsatPathText(p) + '</span>').join('')
      : '<span style="color:var(--ink-3)">영역마다 3등급씩 올려도 닿지 않습니다. 지금은 최저가 없는 전형이 현실적입니다.</span>');
  return '<tr' + (custom ? ' class="custom"' : '') + '><td class="rowhead">' + label + '</td><td class="num">' + r.sum + '</td><td>' + status + '</td><td class="how">' + how + '</td></tr>';
}

function mkCsatCard(recent) {
  if (!recent) return '';
  const rows = MK_CSAT_PRESETS.map(p => mkCsatRow(recent, p[0], p[1], false)).join('') + mkCsatRow(recent, mkCsatK, mkCsatSum, true);
  const t1 = recent.subjects['탐구1'], t2 = recent.subjects['탐구2'];
  const two = t1 && t2 && t1.grade !== null && t2.grade !== null;

  return '<div class="result-card"><div class="result-title">' + ic('target', 17) + ' 수능 최저 충족 시뮬레이터 ' +
    '<span style="font-size:10.5px;font-weight:700;color:var(--ink-3);margin-left:6px">' + mkEsc(recent.fullLabel) + ' 기준</span></div>' +
    '<div class="card-sub">국어·수학·영어·탐구 중 등급이 좋은 영역부터 골라 합을 냅니다. 못 채우는 기준은 <b>가장 적게 올려서 채우는 길</b>을 보여줍니다.' +
    (two ? ' <label class="mk-csat-opt"><input type="checkbox" ' + (mkCsatTamguAvg ? 'checked' : '') + ' onchange="mkToggleCsatTamgu()"> 탐구 2과목 평균으로 계산 (기본: 좋은 1과목)</label>' : '') + '</div>' +
    '<div class="tbl-wrap"><table class="mk-table mk-csat"><thead><tr><th>기준</th><th>현재 합</th><th>결과</th><th>채우는 길</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="mk-banner warn" style="margin:10px 0 0">한국사 기준, 탐구 반영 방식(1과목/2과목 평균), 영어 포함 여부는 대학·전형마다 다릅니다. 지원할 대학의 모집요강 기준으로 맨 아래 줄을 맞춰 보세요.</div>' +
    '</div>';
}

// ═══════════════════════════════════════════════
// 학급 성향 지도 (산점도) + 성향 분포 (도넛)
// ═══════════════════════════════════════════════
function mkClassTrackData() {
  if (!allStudents) return [];
  const out = [];
  for (const name of Object.keys(mockStudents)) {
    if (!allStudents[name]) continue;
    const n9 = naesinAvg9For(name);
    if (n9 === null) continue;
    const j = ME.judgeTrack(n9, mockStudents[name], { weightSet: mockWeight, mergeTamgu: mockMergeTamgu });
    if (j.incomplete) continue;
    out.push({ name: name, n9: j.naesin9, mock: j.mockAvg, delta: j.delta, track: j.track });
  }
  return out;
}

function mkClassTrackCard(focus) {
  const data = mkClassTrackData();
  if (data.length < 2) return '';
  const cnt = k => data.filter(d => d.track.key === k).length;
  const order = [ME.TRACK.SUSI, ME.TRACK.BALANCE, ME.TRACK.JEONGSI];
  const legend = order.map(t => {
    const n = cnt(t.key);
    const names = data.filter(d => d.track.key === t.key).sort((a, b) => a.delta - b.delta).map(d => d.name);
    return '<div class="mk-donut-row"><i style="background:' + t.color + '"></i><b>' + t.label + '</b>' +
      '<span class="n">' + n + '명</span><span class="p">' + Math.round(n / data.length * 100) + '%</span>' +
      '<div class="who">' + names.map(nm => '<button onclick="mkPickStudent(\'' + mkEsc(nm).replace(/'/g, '') + '\')"' + (nm === focus ? ' class="on"' : '') + '>' + mkEsc(nm) + '</button>').join('') + '</div></div>';
  }).join('');

  return '<div class="result-card"><div class="result-title">' + ic('users', 17) + ' ' + mkScopeLabel().short + ' 수시·정시 성향 지도</div>' +
    '<div class="card-sub">가로는 내신, 세로는 모의고사 주요과목 평균입니다(9등급 기준, 오른쪽·위쪽이 좋은 등급). ' +
    '대각선 위쪽은 모의가 앞서는 <b style="color:' + ME.TRACK.JEONGSI.color + '">정시 우위</b>, 아래쪽은 내신이 앞서는 <b style="color:' + ME.TRACK.SUSI.color + '">수시 우위</b>, 가운데 띠는 <b style="color:' + ME.TRACK.BALANCE.color + '">균형</b>입니다. 점이나 이름을 누르면 그 학생으로 바뀝니다.</div>' +
    '<div class="mk-map-row">' +
    '<div class="mk-map"><canvas id="mk-map"></canvas></div>' +
    '<div class="mk-donut-box"><div class="mk-donut"><canvas id="mk-donut"></canvas></div>' + legend + '</div>' +
    '</div></div>';
}

/** 산점도 배경: 정시/균형/수시 영역을 옅게 칠하고 대각선을 긋는다 */
const mkTrackZonePlugin = {
  id: 'mkTrackZone',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: ca, scales: { x, y } } = chart;
    if (!ca) return;
    const P = (a, b) => [x.getPixelForValue(a), y.getPixelForValue(b)];
    const th = ME.TRACK_THRESHOLD;
    const poly = (pts, color) => {
      ctx.beginPath();
      pts.map(p => P(p[0], p[1])).forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(ca.left, ca.top, ca.width, ca.height); ctx.clip();
    // 모의 ≤ 내신 - th : 정시 / 모의 ≥ 내신 + th : 수시 / 그 사이 : 균형
    poly([[0, -th], [10, 10 - th], [10, -1], [0, -1]], hexA(ME.TRACK.JEONGSI.color, .07));
    poly([[0, th], [10, 10 + th], [10, 11], [0, 11]], hexA(ME.TRACK.SUSI.color, .07));
    poly([[0, -th], [10, 10 - th], [10, 10 + th], [0, th]], hexA(ME.TRACK.BALANCE.color, .08));
    // 대각선 (내신 = 모의)
    const a = P(0.5, 0.5), b = P(9.5, 9.5);
    ctx.setLineDash([5, 4]); ctx.strokeStyle = mkCss('--ink-3', .6); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
    // 영역 이름
    ctx.font = '800 11px ' + (typeof LABEL_FONT !== 'undefined' ? LABEL_FONT : 'sans-serif');
    ctx.fillStyle = hexA(ME.TRACK.JEONGSI.color, .75); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('정시 우위 영역', ca.left + 8, ca.top + 6);
    ctx.fillStyle = hexA(ME.TRACK.SUSI.color, .75); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('수시 우위 영역', ca.right - 8, ca.bottom - 6);
    ctx.restore();
  },
  afterDatasetsDraw(chart) {
    // 점 옆에 이름. 몰려 있는 점은 이름이 겹치므로 위아래·왼쪽으로 비켜 놓는다.
    const ctx = chart.ctx, ca = chart.chartArea;
    const font = typeof LABEL_FONT !== 'undefined' ? LABEL_FONT : 'sans-serif';
    const items = [];
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => items.push({ el: el, p: ds.data[i], color: ds.borderColor }));
    });
    items.sort((a, b) => (b.p.focus ? 1 : 0) - (a.p.focus ? 1 : 0));   // 선택한 학생 자리를 먼저 잡는다
    const placed = [];
    const hit = r => placed.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) ||
      items.some(it => it.el.x > r.x - 3 && it.el.x < r.x + r.w + 3 && it.el.y > r.y - 3 && it.el.y < r.y + r.h + 3);
    ctx.save(); ctx.textBaseline = 'middle';
    items.forEach(it => {
      const size = it.p.focus ? 12 : 9.5, gap = it.p.focus ? 11 : 7;
      ctx.font = '800 ' + size + 'px ' + font;
      const w = ctx.measureText(it.p.name).width, h = size + 2;
      const tries = [];
      [0, -11, 11, -20, 20].forEach(dy => { tries.push({ side: 1, dy: dy }); tries.push({ side: -1, dy: dy }); });
      let pick = null;
      for (const t of tries) {
        const x = t.side > 0 ? it.el.x + gap : it.el.x - gap - w;
        const r = { x: x, y: it.el.y + t.dy - h / 2, w: w, h: h };
        if (r.x < ca.left || r.x + r.w > ca.right + 30) continue;
        if (!hit(r)) { pick = r; break; }
      }
      if (!pick) pick = { x: it.el.x + gap, y: it.el.y - h / 2, w: w, h: h };
      placed.push(pick);
      ctx.textAlign = 'left';
      if (typeof _strokeLabel === 'function') _strokeLabel(ctx, it.p.name, pick.x, pick.y + h / 2, size, it.p.focus ? it.color : mkCss('--ink-2'));
      else { ctx.fillStyle = mkCss('--ink-2'); ctx.fillText(it.p.name, pick.x, pick.y + h / 2); }
    });
    ctx.restore();
  }
};

function hexA(hex, a) {
  const m = String(hex).match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
}

function mkBuildClassTrackCharts(focus) {
  if (typeof Chart === 'undefined') return;
  const data = mkClassTrackData();
  const order = [ME.TRACK.SUSI, ME.TRACK.BALANCE, ME.TRACK.JEONGSI];

  const cv = document.getElementById('mk-map');
  if (cv) {
    mkDestroyChart('map');
    mkCharts.map = new Chart(cv.getContext('2d'), {
      type: 'scatter',
      plugins: [mkTrackZonePlugin],
      data: {
        datasets: order.map(t => {
          const pts = data.filter(d => d.track.key === t.key).map(d => ({ x: d.n9, y: d.mock, name: d.name, delta: d.delta, focus: d.name === focus }));
          return {
            label: t.label, data: pts,
            backgroundColor: pts.map(p => p.focus ? t.color : hexA(t.color, .78)),
            borderColor: t.color,
            pointBorderColor: pts.map(p => p.focus ? '#ffffff' : t.color),
            pointBorderWidth: pts.map(p => p.focus ? 3 : 1),
            pointRadius: pts.map(p => p.focus ? 9 : 5.5),
            pointHoverRadius: 9
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 34 } },
        onClick: (e, els) => {
          if (!els.length) return;
          const p = mkCharts.map.data.datasets[els[0].datasetIndex].data[els[0].index];
          if (p && p.name) mkPickStudent(p.name);
        },
        onHover: (e, els) => { if (e.native && e.native.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10.5, weight: '700' } } },
          tooltip: {
            callbacks: {
              label: c => {
                const p = c.raw;
                return p.name + ' · 내신 ' + mkFix(p.x) + ' / 모의 ' + mkFix(p.y) + ' (격차 ' + (p.delta > 0 ? '+' : '') + mkFix(p.delta) + ')';
              }
            }
          }
        },
        scales: {
          x: {
            min: 0.5, max: 9.5, reverse: true,
            title: { display: true, text: '내신 (9등급 환산)  →  좋음', font: { size: 10.5, weight: '800' }, color: mkCss('--ink-2') },
            afterBuildTicks: ax => { ax.ticks = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => ({ value: v })); },
            ticks: { callback: v => v + '등급', font: { size: 9.5 } }, grid: { color: mkCss('--line') }
          },
          y: {
            min: 0.5, max: 9.5, reverse: true,
            title: { display: true, text: '모의고사 평균  ↑  좋음', font: { size: 10.5, weight: '800' }, color: mkCss('--ink-2') },
            afterBuildTicks: ax => { ax.ticks = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => ({ value: v })); },
            ticks: { callback: v => v + '등급', font: { size: 9.5 } }, grid: { color: mkCss('--line') }
          }
        }
      }
    });
  }

  const dv = document.getElementById('mk-donut');
  if (dv) {
    const counts = order.map(t => data.filter(d => d.track.key === t.key).length);
    mkDestroyChart('donut');
    mkCharts.donut = new Chart(dv.getContext('2d'), {
      type: 'doughnut',
      plugins: [{
        id: 'mkDonutCenter',
        afterDraw(chart) {
          const { ctx, chartArea: ca } = chart;
          const cx = (ca.left + ca.right) / 2, cy = (ca.top + ca.bottom) / 2;
          ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = mkCss('--ink');
          ctx.font = '900 24px ' + (typeof LABEL_FONT !== 'undefined' ? LABEL_FONT : 'sans-serif');
          ctx.fillText(data.length + '명', cx, cy - 6);
          ctx.fillStyle = mkCss('--ink-3');
          ctx.font = '700 10.5px ' + (typeof LABEL_FONT !== 'undefined' ? LABEL_FONT : 'sans-serif');
          ctx.fillText('판정 가능', cx, cy + 15);
          ctx.restore();
        }
      }],
      data: {
        labels: order.map(t => t.label),
        datasets: [{ data: counts, backgroundColor: order.map(t => t.color), borderColor: mkCss('--paper'), borderWidth: 3, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.label + ' ' + c.parsed + '명' } } }
      }
    });
  }
}

/** 지도·명단에서 학생을 누르면 그 학생으로 분석을 다시 돌린다 */
function mkPickStudent(name) {
  const sel = document.getElementById('stu-sel');
  if (!sel || ![...sel.options].some(o => o.value === name)) return;
  const tab = currentResultTab;
  sel.value = name;
  onStudentChange();
  if (typeof checkAll === 'function') checkAll(true);
  generateAll();
  switchResultTab(tab === 'naesin' ? 'fusion' : tab);
}

/** 판정 게이지: 가운데에서 출발해 판정 위치까지 미끄러지고, 그다음 판정 글자가 떠오른다 */
function mkPlayGauge() {
  const box = document.querySelector('#tab-fusion .mk-judge');
  if (!box) return;
  const pin = box.querySelector('.mk-gauge .pin');
  if (!pin) return;
  box.classList.remove('go');
  pin.style.left = '50%';
  void box.offsetWidth;   // 처음 위치를 한 번 계산하게 해야 transition이 걸린다
  // requestAnimationFrame은 창이 가려져 있으면 멈춘다 → 타이머로 확실히 출발시킨다
  clearTimeout(mkPlayGauge._t);
  mkPlayGauge._t = setTimeout(() => {
    box.classList.add('go');
    pin.style.left = pin.dataset.to + '%';
  }, 60);
}

// ═══════════════════════════════════════════════
// 상담 프롬프트 · 출력 연동
// ═══════════════════════════════════════════════

/** buildPrompt에 덧붙일 모의고사 데이터 블록. 데이터 없으면 '' */
function mkPromptData(name) {
  const stu = mockStudents[name];
  if (!stu) return '';
  const series = ME.examDelta(ME.examSeries(stu, mockWeight, mockMergeTamgu));
  if (!series.length) return '';

  let p = '\n■ 모의고사 성적 (전국 기준 9등급):\n';
  for (const ex of series) {
    const parts = ME.AREAS.filter(a => ex.subjects[a]).map(a => {
      const s = ex.subjects[a];
      const base = mkAreaName(a, ex);
      const nm = s.sel && s.sel !== base ? base + '(' + s.sel + ')' : base;
      let v = nm + ' ' + (s.grade === null ? '-' : s.grade) + '등급';
      if (s.pct !== null && !s.pctDerived) v += '/백분위 ' + s.pct;
      if (s.raw !== null) v += '/원점수 ' + s.raw;
      return v;
    });
    p += '- ' + ex.year + '년 ' + ex.label + ' [' + ex.org + ']: ' + parts.join(', ') +
      ' → 반영과목 평균 ' + mkFix(ex.mainAvg) + '등급' +
      (ex.delta !== null ? ' (직전 대비 ' + (ex.delta > 0 ? '+' : '') + mkFix(ex.delta) + ')' : '') + '\n';
  }

  const dg = ME.diagnoseSubjects(stu, { weightSet: mockWeight, mergeTamgu: mockMergeTamgu });
  if (dg.notes.length) p += '\n■ 모의고사 영역 진단:\n' + dg.notes.map(n => '- ' + n).join('\n') + '\n';

  // 통합 판정
  const n9 = naesinAvg9For(name);
  if (n9 !== null) {
    const j = ME.judgeTrack(n9, stu, { weightSet: mockWeight, mergeTamgu: mockMergeTamgu, naesinTrend: naesinTrend9(name) });
    if (!j.incomplete) {
      p += '\n■ 내신 vs 모의고사 대비 (9등급 축 통일):\n';
      p += '- 내신 평균(9등급 환산): ' + mkFix(j.naesin9) + '등급\n';
      p += '- 모의고사 주요과목 평균: ' + mkFix(j.mockAvg) + '등급\n';
      p += '- 격차: ' + (j.delta > 0 ? '+' : '') + mkFix(j.delta) + ' → 판정: ' + j.track.label + '\n';
      p += '- 판정 근거:\n' + j.reasons.map(r => '  · ' + r).join('\n') + '\n';

      const est = ME.estimateJeongsiLine(j.series[j.series.length - 1], MOCK_UNIV_LINES);
      if (est) {
        p += '- 정시 추정 라인(참고용): 국수영탐 백분위 평균 ' + est.pctAvg + ' → ' + est.line.group + ' (' + est.line.example + ')\n';
        p += '  ※ 대학별 반영비율·변환표준점수 미반영 추정치이므로 단정적으로 표현하지 말 것\n';
      }
    }
  }
  return p;
}

/** buildPrompt 분석 요청에 덧붙일 항목. 데이터 없으면 '' */
function mkPromptAsk(name) {
  if (!mockStudents[name]) return '';
  const hasNaesin = !!(allStudents && allStudents[name]);
  let p = '\n6. 수시 · 정시 전략 판단\n';
  if (hasNaesin) {
    p += '   - 내신과 모의고사 격차를 근거로 이 학생이 수시·정시 중 어디에 무게를 둬야 하는지 판단\n';
    p += '   - 수시 지원 시 적합한 전형(교과/학종/논술)과 그 이유\n';
    p += '   - 수능 최저학력기준 충족 가능성과 충족을 위해 끌어올려야 할 영역\n';
  } else {
    p += '   - 모의고사 성적만으로 본 정시 경쟁력과 보완 영역\n';
  }
  p += '   - 남은 기간 영역별 학습 시간 배분 제안 (투입 대비 등급 상승 효과가 큰 순서로)\n';
  if (mkStuIntegrated(name)) p += '   - 통합사회·통합과학 중 보완이 더 급한 쪽과 그 이유 (고1·2는 국어·수학 선택과목이 없고 탐구 두 과목을 모두 응시함)\n\n';
  else p += '   - 탐구 과목 조합·선택과목이 적절한지, 교체를 검토할 필요가 있는지\n\n';
  return p;
}

/** 엑셀/인쇄용 — 모의고사 요약 행 배열 */
function mkExcelRows(name) {
  const stu = mockStudents[name];
  if (!stu) return null;
  const series = ME.examDelta(ME.examSeries(stu, mockWeight, mockMergeTamgu));
  const areas = ME.AREAS.filter(a => series.some(e => e.subjects[a]));

  const rows = [];
  rows.push(['회차', '주관', ...areas.flatMap(a => { const nm = mkAreaName(a, series); return [nm + ' 원점수', nm + ' 표준', nm + ' 백분위', nm + ' 등급']; }), '반영 평균등급', '직전 대비']);
  for (const ex of series) {
    const cells = areas.flatMap(a => {
      const s = ex.subjects[a];
      return s ? [s.raw, s.std, s.pct, s.grade] : ['', '', '', ''];
    });
    rows.push([ex.year + '년 ' + ex.label, ex.org, ...cells, ex.mainAvg, ex.delta]);
  }
  return { rows: rows, areas: areas, series: series };
}

/** 모의고사 차트를 오프스크린에서 PNG로 떠낸다.
 *  일괄 인쇄는 화면에 그려진 캔버스를 쓸 수 없어(학생마다 다시 그려야 한다)
 *  화면과 같은 config로 새 캔버스에 그린 뒤 이미지를 뽑는다. */
function mkRenderTrendPng(stu) {
  const cfg = mkTrendConfig(stu, { png: true });
  if (!cfg || typeof renderConfigToBase64 !== 'function') return Promise.resolve(null);
  return renderConfigToBase64(760, 360, cfg);
}
function mkRenderRadarPng(stu) {
  const cfg = mkRadarConfig(stu, { png: true });
  if (!cfg || typeof renderConfigToBase64 !== 'function') return Promise.resolve(null);
  return renderConfigToBase64(520, 430, cfg);
}

/** 인쇄물용 모의고사 블록.
 *  화면의 모의고사 탭과 같은 자료가 나와야 한다 —
 *  요약 KPI · 회차별 성적표 · 추이 · 레이더 · 강약 진단 · 수시/정시 판정.
 *  (반영 과목 체크박스와 프롬프트 카드는 인쇄에 의미가 없어 뺀다.) */
async function mkPrintBlock(name, withChart) {
  const stu = mockStudents[name];
  if (!stu) return '';
  const series = ME.examDelta(ME.examSeries(stu, mockWeight, mockMergeTamgu));
  if (!series.length) return '';
  const recent = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;

  let html = '<div class="bp-sec">모의고사 분석</div>';
  html += mkKpiCard(name, series, recent, prev);
  html += mkScoreTableCard(series);

  if (withChart !== false) {
    let trend = null, radar = null;
    try { trend = await mkRenderTrendPng(stu); } catch (e) {}
    try { radar = await mkRenderRadarPng(stu); } catch (e) {}
    if (trend || radar) {
      html += '<div class="bp-charts2">' +
        (trend ? '<img class="bp-chart2" src="data:image/png;base64,' + trend + '" alt="영역별 등급 추이">' : '') +
        (radar ? '<img class="bp-chart2" src="data:image/png;base64,' + radar + '" alt="영역별 백분위">' : '') +
        '</div>';
    }
  }

  html += mkDiagnosisCard(stu);
  // 수시/정시 우위 판정은 인쇄물에 넣지 않는다.
  // 학생이 '정시 우위'만 보고 내신·학교생활을 놓는 판단으로 이어질 수 있어
  // 화면에서 교사가 보고 상담에만 쓰도록 한다. (mkJudgeBlock은 화면·상담용으로 남겨 둔다)
  return html;
}

/** 수시/정시 판정 요약 — 인쇄물과 모의 전용 블록이 함께 쓴다 */
function mkJudgeBlock(name, stu) {
  const n9 = naesinAvg9For(name);
  const j = ME.judgeTrack(n9, stu, { weightSet: mockWeight, mergeTamgu: mockMergeTamgu, naesinTrend: naesinTrend9(name) });
  if (j.incomplete) {
    return '<div class="result-card"><div class="result-title">' + ic('scale', 17) + ' 수시 · 정시 판정</div>' +
      '<div class="note info">내신 자료가 없어 수시·정시 판정은 생략했습니다. 내신 파일을 함께 올리면 두 성적을 같은 9등급 자 위에 놓고 비교합니다.</div></div>';
  }
  return '<div class="result-card"><div class="result-title">' + ic('scale', 17) + ' 수시 · 정시 판정</div>' +
    '<div class="mk-judge-print" style="border-color:' + j.track.color + '">' +
    '<b style="color:' + j.track.color + '">' + mkEsc(j.track.label) + '</b> — 내신 ' + mkFix(j.naesin9) +
    '등급(9등급 환산) vs 모의 ' + mkFix(j.mockAvg) + '등급 · 격차 ' + (j.delta > 0 ? '+' : '') + mkFix(j.delta) + '</div>' +
    (j.reasons.length ? '<ul class="mk-reasons" style="margin-top:9px">' + j.reasons.map(r => '<li>' + mkEsc(r) + '</li>').join('') + '</ul>' : '') +
    '</div>';
}

/** 학급 일괄 처리 대상 — 내신 명단과 모의고사 명단의 합집합.
 *  둘 중 하나만 올려도 일괄 인쇄·엑셀·프롬프트가 돌아야 한다. */
function mkBatchNames() {
  const seen = new Set();
  const out = [];
  Object.keys(allStudents).forEach(n => { if (!seen.has(n)) { seen.add(n); out.push(n); } });
  Object.keys(mockStudents).forEach(n => { if (!seen.has(n)) { seen.add(n); out.push(n); } });
  return out;
}

/** 내신 없이 모의고사만 있는 학생의 인쇄 블록 */
async function mkOnlyStudentBlock(name, idx, total, withChart) {
  const block = await mkPrintBlock(name, withChart);
  return '<section class="bp-student">' +
    '<div class="print-head" style="display:flex">' +
    '<div class="ph-name">' + mkEsc(name) + ' 모의고사 분석 상담 자료</div>' +
    '<div class="ph-meta">모의고사만 올린 학생 · 내신 자료 없음<br>출력일 ' + mkToday() + ' · ' + idx + '/' + total + '</div>' +
    '</div>' +
    (block || '<div class="note info">이 학생의 모의고사 회차가 없습니다.</div>') +
    '<div class="print-foot" style="display:block">고교 성적 나침반 5.0 · 2028 개편 5등급제 담임 상담 자료 · 교내 상담 목적으로만 사용해 주세요.</div>' +
    '</section>';
}

function mkToday() {
  const d = new Date();
  return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
}

/** 초기화 — 화면을 비운다. 저장분을 지울지는 따로 묻는다. */
function mkResetAll() {
  mockStudents = {};
  mockDashKey = null;
  mkDistArea = null;
  mkPending = null;
  mkDestroyAllCharts();
  const p = document.getElementById('mk-paste'); if (p) p.value = '';
  const fi = document.getElementById('mk-file-info'); if (fi) { fi.style.display = 'none'; fi.innerHTML = ''; }
  const fin = document.getElementById('mk-file'); if (fin) fin.value = '';
  const pd = document.getElementById('mk-pending'); if (pd) { pd.style.display = 'none'; pd.innerHTML = ''; }
  mkRenderChips();
  mkUpdateTabBadges();
  switchResultTab('naesin');

  // 화면만 비우면 다음에 열 때 저장분이 되살아나 혼란스럽다 → 여기서 물어본다
  const info = mkStoreInfo();
  if (info.ok && !mkResetQuiet) {   // 저장분 골라 지우기(mock-store.js)가 화면을 다시 짤 때는 묻지 않는다
    if (confirm('브라우저에 저장된 성적도 함께 지울까요?\n\n  확인 — 저장분까지 삭제 (다음에 열어도 빈 화면)\n  취소 — 저장분은 남김 (다음에 열면 다시 나옴)')) {
      mkStoreClear(true);
    }
  }
  mkStoreRender();
}

// ═══════════════════════════════════════════════
// 모의고사 데이터 → 표준 엑셀 내보내기
// (PDF로 읽은 것을 재사용 가능한 파일로 남길 때)
// ═══════════════════════════════════════════════
function mkExportMockXlsx() {
  if (!mkHasData()) { showToast('내보낼 모의고사 데이터가 없습니다.'); return; }
  const keys = ME.allExamKeys(mockStudents);
  const wb = XLSX.utils.book_new();

  for (const key of keys) {
    const meta = ME.examMetaOf(mockStudents, key);
    // 이 회차에 등장하는 영역만
    const areas = ME.AREAS.filter(a =>
      Object.values(mockStudents).some(s => s.exams[key] && s.exams[key].subjects[a]));

    const header = ['학번', '반', '번호', '이름'];
    for (const a of areas) {
      const isAbs = ME.ABS_AREAS.indexOf(a) >= 0;
      header.push(a + '원점수');
      if (!isAbs) { header.push(a + '표준점수'); header.push(a + '백분위'); }
      header.push(a + '등급');
      if (a.indexOf('탐구') === 0) header.push(a + '과목명');
    }

    const rows = [
      [meta.year + '년 ' + meta.label + ' (' + (ME.ORG_LABEL[meta.org] || meta.org) + ') — 성적 돋보기에서 내보냄'],
      ['· 이 파일은 그대로 다시 업로드할 수 있습니다.'],
      [],
      header
    ];

    const list = Object.entries(mockStudents)
      .filter(([, s]) => s.exams[key])
      .sort((a, b) => {
        const ca = parseInt(a[1].meta.cls, 10) || 0, cb = parseInt(b[1].meta.cls, 10) || 0;
        return ca - cb || (a[1].meta.num || 0) - (b[1].meta.num || 0) || a[0].localeCompare(b[0]);
      });

    for (const [nm, stu] of list) {
      const ex = stu.exams[key];
      const row = [stu.meta.uid || '', stu.meta.cls || '', stu.meta.num === null ? '' : stu.meta.num, nm];
      for (const a of areas) {
        const s = ex.subjects[a];
        const isAbs = ME.ABS_AREAS.indexOf(a) >= 0;
        row.push(s && s.raw !== null ? s.raw : '');
        if (!isAbs) {
          row.push(s && s.std !== null && s.std !== undefined ? s.std : '');
          row.push(s && s.pct !== null && !s.pctDerived ? s.pct : '');
        }
        row.push(s && s.grade !== null ? s.grade : '');
        if (a.indexOf('탐구') === 0) row.push(s && s.sel ? s.sel : '');
      }
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = header.map((h, i) => ({ wch: i < 4 ? 10 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, (meta.year + '년 ' + meta.month + '월').slice(0, 31));
  }

  const n = Object.keys(mockStudents).length;
  xlWriteSheetJS(wb, '모의고사성적_' + n + '명_' + keys.length + '회차.xlsx').catch(e => showToast('엑셀 저장 실패: ' + e.message)); // 글꼴 통일
  showToast('엑셀 ' + keys.length + '개 회차를 내려받았습니다.');
}


// ═══════════════════════════════════════════════
// 모의고사 탭 — 상담 프롬프트
// ═══════════════════════════════════════════════

/** 모의고사 중심 상담 프롬프트. 내신이 함께 있으면 대비 내용도 붙는다. */
function mkBuildMockPrompt(name) {
  const stu = mockStudents[name];
  if (!stu) return '';
  const career = (document.getElementById('career-inp') || {}).value || '';
  const memo = (document.getElementById('memo-inp') || {}).value || '';
  const hasNaesin = !!(allStudents && allStudents[name] && Object.keys(allStudents[name]).length);

  let p = '';
  p += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  p += '■ [모의고사 성적 데이터]\n';
  p += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  p += '이름: ' + name + '\n';
  if (stu.meta && stu.meta.cls) p += '학급: ' + stu.meta.cls + '반' + (stu.meta.num ? ' ' + stu.meta.num + '번' : '') + '\n';
  if (career) p += '진로 희망: ' + career + '\n';
  const integ = mkStuIntegrated(name);
  const lastEx = ME.examSeries(stu).slice(-1);
  p += '반영 과목: ' + [...mockWeight].map(a => mkAreaName(a, lastEx)).join(' · ') + (mockMergeTamgu ? ' (탐구 2과목은 평균내어 1과목으로)' : '') + '\n';
  if (integ) p += '체제: 고1·2 공통 체제 (국어·수학 선택과목 없음, 탐구는 통합사회·통합과학 모두 응시)\n';
  if (!hasNaesin) p += '\n※ 내신 자료는 올라와 있지 않습니다. 모의고사만으로 분석해 주세요.\n';

  p += mkPromptData(name);
  if (memo) p += '\n■ 담임 관찰 메모:\n' + memo + '\n';

  p += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  p += '■ [분석 요청]\n';
  p += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  p += '위 모의고사 성적을 바탕으로, 담임교사가 학생 상담에서 바로 쓸 수 있게 구체적으로 써 주세요.\n\n';
  p += '1. 영역별 강점과 약점\n';
  p += '   - 어느 영역이 받쳐 주고 어느 영역이 발목을 잡는지\n';
  p += '   - 회차별 흐름에서 읽히는 원인 (난이도 탓인지 실력 변화인지)\n\n';
  p += '2. 투입 대비 효과가 큰 순서\n';
  p += '   - 등급 경계에 걸린 영역부터, 한 등급 올리려면 무엇이 필요한지\n';
  p += '   - 영어·한국사는 절대평가라 목표 점수를 숫자로 제시\n\n';
  if (integ) {
    p += '3. 통합사회 · 통합과학 균형 점검\n';
    p += '   - 두 과목 모두 응시하므로 바꿀 수 없다는 전제에서, 어느 쪽을 먼저 끌어올릴지\n\n';
  } else {
    p += '3. 선택과목 · 탐구 조합 점검\n';
    p += '   - 지금 조합이 이 학생에게 맞는지, 바꿀 만한 이유가 있는지\n\n';
  }
  p += '4. 남은 기간 학습 시간 배분\n';
  p += '   - 주당 시간을 영역별로 어떻게 나눌지 구체적인 비율로\n\n';
  if (hasNaesin) {
    p += '5. 수시 · 정시 전략\n';
    p += '   - 내신과 모의고사 격차를 근거로 어느 쪽에 무게를 둘지\n';
    p += '   - 수능 최저학력기준 충족 가능성과, 충족을 위해 끌어올려야 할 영역\n\n';
    p += '6. 상담에서 학생에게 전할 말\n';
  } else {
    p += '5. 상담에서 학생에게 전할 말\n';
  }
  p += '   - 먼저 인정해 줄 부분\n';
  p += '   - 고쳐야 할 부분을 상하지 않게 전하는 방법\n';
  p += '   - 학부모 상담에서 쓸 한 문단 요약\n\n';
  p += '※ 추상적인 조언 대신 위의 숫자를 근거로 써 주세요. ';
  p += '「참고용 추정치」라고 적힌 값(정시 라인 등)은 단정적으로 말하지 말아 주세요.';
  return p;
}

/** 모의고사 탭에 붙는 프롬프트 카드 */
function mkPromptCard() {
  const name = currentStudent;
  if (!name || !mockStudents[name]) return '';
  const text = mkBuildMockPrompt(name);
  return '<div class="prompt-card" id="mk-prompt-card">' +
    '<div class="prompt-hdr"><div class="t">' + ic('clipboard', 17) + ' 모의고사 상담 프롬프트</div>' +
    '<button class="copy-btn" onclick="mkCopyPrompt()">' + ic('copy', 14) + ' 복사</button></div>' +
    '<textarea id="mk-prompt-output" readonly>' + mkEsc(text) + '</textarea>' +
    '<div style="padding:13px 16px;border-top:1px solid var(--line)">' +
    '<div style="font-size:11.5px;font-weight:700;color:var(--ink-3);margin-bottom:8px">복사해서 아래 AI에 붙여넣으세요</div>' +
    '<div class="ai-links">' +
    '<a href="https://claude.ai" target="_blank" rel="noopener">Claude</a>' +
    '<a href="https://chatgpt.com" target="_blank" rel="noopener">ChatGPT</a>' +
    '<a href="https://gemini.google.com" target="_blank" rel="noopener">Gemini</a>' +
    '</div></div></div>';
}

/* ══════════════ 모의고사/mock-excel.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   모의고사 엑셀 출력 (mock-excel.js)
   ───────────────────────────────────────────────────────────────
   mock-ui.js 뒤에 이어서 인라인 삽입한다. ExcelJS 전역이 필요하다.
     · mkAddExcelSheet(wb, name)        개인 엑셀에 '모의고사' 시트
     · mkAddBatchExcelSheet(wb, names)  일괄 엑셀에 '모의고사 통합' 시트
   ═══════════════════════════════════════════════════════════════ */

const MK_BLUE = 'FF27272A';   // 화면 강조색(--accent)과 맞춘다
const MK_PURPLE = MK_BLUE;    // 옛 이름 유지 (기존 호출부가 쓴다)
const MK_TEAL = 'FF0D9488';
const MK_GC = { 1: 'FFD1FAE5', 2: 'FFD1FAE5', 3: 'FFFEF3C7', 4: 'FFFFE4E6', 5: 'FFFCE7F3', 6: 'FFFECACA', 7: 'FFFCA5A5', 8: 'FFF87171', 9: 'FFEF4444' };

function mkCell(ws, r, c, v, opt) {
  const cell = ws.getCell(r, c);
  cell.value = (v === null || v === undefined) ? '' : v;
  opt = opt || {};
  cell.font = Object.assign({ size: 9 }, opt.font);
  if (opt.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } };
  cell.alignment = Object.assign({ horizontal: 'center', vertical: 'middle' }, opt.align);
  if (opt.wrap) cell.alignment.wrapText = true;
  return cell;
}

function mkGradeFill(g) {
  return (typeof g === 'number' && isFinite(g)) ? MK_GC[Math.min(9, Math.max(1, Math.round(g)))] : undefined;
}

/** 개인 엑셀에 '모의고사' 시트 추가 */
function mkAddExcelSheet(wb, name, sheetName) {
  if (!name || !mockStudents[name]) return;
  const info = mkExcelRows(name);
  if (!info) return;
  const areas = info.areas, series = info.series;

  // 일괄 엑셀에서는 학생마다 부르므로 시트 이름을 밖에서 받는다 (겹치면 ExcelJS가 던진다)
  const ws = wb.addWorksheet(sheetName || '모의고사');
  ws.pageSetup = {
    paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 }
  };

  const cAvg = 3 + areas.length * 4;
  const nCols = cAvg + 1;

  ws.mergeCells(1, 1, 1, nCols);
  mkCell(ws, 1, 1, name + ' 모의고사 성적 분석',
    { font: { bold: true, size: 15, color: { argb: MK_BLUE } }, fill: 'FFEAF2F8' });
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, nCols);
  mkCell(ws, 2, 1, '반영 과목: ' + [...mockWeight].map(a => mkAreaName(a, series)).join('·') + (mockMergeTamgu ? ' (탐구 2과목 평균)' : '') + '  |  ' + series.length + '개 회차',
    { font: { bold: true, size: 10, color: { argb: 'FF374151' } }, fill: 'FFFEF9C3' });

  // ── 헤더 2행 ──
  const hr = 4;
  mkCell(ws, hr, 1, '회차', { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_PURPLE });
  mkCell(ws, hr, 2, '주관', { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_PURPLE });
  ws.mergeCells(hr, 1, hr + 1, 1);
  ws.mergeCells(hr, 2, hr + 1, 2);

  areas.forEach((a, i) => {
    const c0 = 3 + i * 4;
    ws.mergeCells(hr, c0, hr, c0 + 3);
    mkCell(ws, hr, c0, mkAreaName(a, series), { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_TEAL });
    ['원점수', '표준', '백분위', '등급'].forEach((m, j) => {
      mkCell(ws, hr + 1, c0 + j, m, { font: { bold: true, size: 8 }, fill: 'FFE6F6F1' });
      ws.getColumn(c0 + j).width = 8;
    });
  });
  mkCell(ws, hr, cAvg, '반영 평균', { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_PURPLE });
  mkCell(ws, hr, cAvg + 1, '직전 대비', { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_PURPLE });
  ws.mergeCells(hr, cAvg, hr + 1, cAvg);
  ws.mergeCells(hr, cAvg + 1, hr + 1, cAvg + 1);
  ws.getColumn(1).width = 17;
  ws.getColumn(2).width = 9;
  ws.getColumn(cAvg).width = 11;
  ws.getColumn(cAvg + 1).width = 11;

  // ── 회차별 행 ──
  let r = hr + 2;
  for (const ex of series) {
    mkCell(ws, r, 1, ex.year + '년 ' + ex.label, { font: { bold: true, size: 9 }, align: { horizontal: 'left' } });
    mkCell(ws, r, 2, ex.org, { font: { size: 8, color: { argb: 'FF6B7280' } } });
    areas.forEach((a, i) => {
      const c0 = 3 + i * 4;
      const s = ex.subjects[a];
      mkCell(ws, r, c0, s ? s.raw : '');
      mkCell(ws, r, c0 + 1, s ? s.std : '');
      mkCell(ws, r, c0 + 2, s ? s.pct : '');
      mkCell(ws, r, c0 + 3, s && s.grade !== null ? s.grade : '',
        { font: { bold: true, size: 9 }, fill: s ? mkGradeFill(s.grade) : undefined });
    });
    mkCell(ws, r, cAvg, ex.mainAvg, { font: { bold: true, size: 10, color: { argb: 'FFF59E0B' } } });
    const dColor = ex.delta === null ? 'FF9CA3AF' : (ex.delta < 0 ? 'FF0D9488' : (ex.delta > 0 ? 'FFE11D48' : 'FF9CA3AF'));
    mkCell(ws, r, cAvg + 1, ex.delta === null ? '-' : (ex.delta > 0 ? '+' + ex.delta : ex.delta),
      { font: { bold: true, size: 9, color: { argb: dColor } } });
    r++;
  }

  // ── 수시/정시 판정 ──
  const n9 = naesinAvg9For(name);
  const j = ME.judgeTrack(n9, mockStudents[name], { weightSet: mockWeight, mergeTamgu: mockMergeTamgu, naesinTrend: naesinTrend9(name) });

  r += 1;
  ws.mergeCells(r, 1, r, nCols);
  mkCell(ws, r, 1, j.incomplete ? '수시·정시 판정 불가 (내신 데이터 필요)' : ('수시·정시 성향 판정: ' + j.track.label),
    { font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }, fill: j.incomplete ? 'FF9CA3AF' : MK_PURPLE });
  ws.getRow(r).height = 22;
  r++;

  if (!j.incomplete) {
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '내신 ' + mkFix(j.naesin9) + '등급(9등급 환산)   vs   모의 ' + mkFix(j.mockAvg) + '등급   |   격차 ' + (j.delta > 0 ? '+' : '') + mkFix(j.delta),
      { font: { bold: true, size: 10 }, fill: 'FFFEF9C3' });
    r++;
  }
  for (const reason of j.reasons) {
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '· ' + reason, { font: { size: 9 }, align: { horizontal: 'left' }, wrap: true });
    ws.getRow(r).height = 16;
    r++;
  }

  // ── 정시 라인 ──
  const est = (j.incomplete || !series.length) ? null : ME.estimateJeongsiLine(series[series.length - 1], MOCK_UNIV_LINES);
  if (est) {
    r++;
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '정시 추정 라인(참고용): 국수영탐 백분위 평균 ' + est.pctAvg + ' → ' + est.line.group + ' (' + est.line.example + ')',
      { font: { bold: true, size: 10, color: { argb: MK_PURPLE } }, fill: 'FFF5F3FF', align: { horizontal: 'left' } });
    r++;
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '※ ' + est.disclaimer,
      { font: { size: 8, italic: true, color: { argb: 'FF92400E' } }, fill: 'FFFFF8EC', align: { horizontal: 'left' }, wrap: true });
    ws.getRow(r).height = 22;
  }
}

/** 이미 있는 학생 시트 아래에 모의고사 표와 판정을 덧붙인다.
 *  일괄 엑셀에서 학생 한 명이 시트 하나를 갖도록 유지하기 위함이다. */
function mkAppendExcelBlock(ws, name) {
  if (!name || !mockStudents[name]) return;
  const info = mkExcelRows(name);
  if (!info) return;
  const areas = info.areas, series = info.series;
  if (!series.length) return;

  // 그래프 그림은 lastRow에 잡히지 않는다. 그림이 덮는 행까지 넘어가야 표가 그래프 위에 겹치지 않는다.
  let last = ws.lastRow ? ws.lastRow.number : 0;
  (typeof ws.getImages === 'function' ? ws.getImages() : []).forEach(im => {
    const br = im && im.range && im.range.br;
    if (br && typeof br.nativeRow === 'number') last = Math.max(last, br.nativeRow + 1);
  });
  let r = last + 3;

  const cAvg = 3 + areas.length * 4;
  const nCols = cAvg + 1;

  ws.mergeCells(r, 1, r, nCols);
  mkCell(ws, r, 1, '모의고사 · 회차별 성적  (' + series.length + '개 회차)',
    { font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }, fill: MK_BLUE });
  ws.getRow(r).height = 24;
  r++;

  ws.mergeCells(r, 1, r, nCols);
  mkCell(ws, r, 1, '반영 과목: ' + [...mockWeight].map(a => mkAreaName(a, series)).join('·') + (mockMergeTamgu ? ' (탐구 2과목 평균)' : '') +
    '  |  등급 칸 색은 등급대입니다.',
    { font: { size: 9 }, fill: 'FFFEF9C3', align: { horizontal: 'left' } });
  r++;

  // 헤더 2행
  const hr = r;
  mkCell(ws, hr, 1, '회차', { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_BLUE });
  mkCell(ws, hr, 2, '주관', { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_BLUE });
  ws.mergeCells(hr, 1, hr + 1, 1);
  ws.mergeCells(hr, 2, hr + 1, 2);
  areas.forEach((a, i) => {
    const c0 = 3 + i * 4;
    ws.mergeCells(hr, c0, hr, c0 + 3);
    mkCell(ws, hr, c0, mkAreaName(a, series), { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_TEAL });
    ['원점수', '표준', '백분위', '등급'].forEach((m, j2) => {
      mkCell(ws, hr + 1, c0 + j2, m, { font: { bold: true, size: 8 }, fill: 'FFE6F6F1' });
      if (!ws.getColumn(c0 + j2).width) ws.getColumn(c0 + j2).width = 8;
    });
  });
  mkCell(ws, hr, cAvg, '반영 평균', { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_BLUE });
  mkCell(ws, hr, cAvg + 1, '직전 대비', { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_BLUE });
  ws.mergeCells(hr, cAvg, hr + 1, cAvg);
  ws.mergeCells(hr, cAvg + 1, hr + 1, cAvg + 1);
  r = hr + 2;

  for (const ex of series) {
    mkCell(ws, r, 1, ex.year + '년 ' + ex.label, { font: { bold: true, size: 9 }, align: { horizontal: 'left' } });
    mkCell(ws, r, 2, ex.org, { font: { size: 8, color: { argb: 'FF6B7280' } } });
    areas.forEach((a, i) => {
      const c0 = 3 + i * 4;
      const sj = ex.subjects[a];
      mkCell(ws, r, c0, sj ? sj.raw : '');
      mkCell(ws, r, c0 + 1, sj ? sj.std : '');
      mkCell(ws, r, c0 + 2, sj ? sj.pct : '');
      mkCell(ws, r, c0 + 3, sj && sj.grade !== null ? sj.grade : '',
        { font: { bold: true, size: 9 }, fill: sj ? mkGradeFill(sj.grade) : undefined });
    });
    mkCell(ws, r, cAvg, ex.mainAvg, { font: { bold: true, size: 10, color: { argb: 'FFB45309' } } });
    const dColor = ex.delta === null ? 'FF9CA3AF' : (ex.delta < 0 ? 'FF0D9488' : (ex.delta > 0 ? 'FFE11D48' : 'FF9CA3AF'));
    mkCell(ws, r, cAvg + 1, ex.delta === null ? '-' : (ex.delta > 0 ? '+' + ex.delta : ex.delta),
      { font: { bold: true, size: 9, color: { argb: dColor } } });
    r++;
  }

  // 수시/정시 판정
  const n9 = naesinAvg9For(name);
  const j = ME.judgeTrack(n9, mockStudents[name], { weightSet: mockWeight, mergeTamgu: mockMergeTamgu, naesinTrend: naesinTrend9(name) });
  r++;
  ws.mergeCells(r, 1, r, nCols);
  mkCell(ws, r, 1, j.incomplete ? '수시·정시 판정 불가 (내신 자료 필요)' : ('수시·정시 성향 판정: ' + j.track.label),
    { font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }, fill: j.incomplete ? 'FF9CA3AF' : MK_BLUE });
  ws.getRow(r).height = 22;
  r++;
  if (!j.incomplete) {
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '내신 ' + mkFix(j.naesin9) + '등급(9등급 환산)   vs   모의 ' + mkFix(j.mockAvg) +
      '등급   |   격차 ' + (j.delta > 0 ? '+' : '') + mkFix(j.delta),
      { font: { bold: true, size: 10 }, fill: 'FFFEF9C3' });
    r++;
  }
  for (const reason of j.reasons) {
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '· ' + reason, { font: { size: 9 }, align: { horizontal: 'left' }, wrap: true });
    ws.getRow(r).height = 16;
    r++;
  }

  const est = (j.incomplete || !series.length) ? null : ME.estimateJeongsiLine(series[series.length - 1], MOCK_UNIV_LINES);
  if (est) {
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '정시 추정 라인(참고용): 국수영탐 백분위 평균 ' + est.pctAvg + ' → ' + est.line.group + ' (' + est.line.example + ')',
      { font: { bold: true, size: 10, color: { argb: MK_BLUE } }, fill: 'FFEAF2F8', align: { horizontal: 'left' } });
    r++;
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '※ ' + est.disclaimer,
      { font: { size: 8, italic: true, color: { argb: 'FF92400E' } }, fill: 'FFFFF8EC', align: { horizontal: 'left' }, wrap: true });
    ws.getRow(r).height = 22;
  }
}

/** 일괄 엑셀의 학생별 시트마다 모의고사 상세를 덧붙인다.
 *  batchExcel이 names 순서대로 시트를 만들기 때문에 순서로 짝지을 수 있지만,
 *  시트가 밀렸을 때를 대비해 이름으로도 확인한다. */
function mkAppendBatchStudentSheets(wb, names) {
  if (!mkHasData() || !names || !names.length) return;
  const sheets = wb.worksheets.filter(w => w.name !== '학생명단' && w.name !== '모의고사 통합');
  names.forEach((name, i) => {
    if (!mockStudents[name]) return;
    let ws = sheets[i];
    if (!ws) return;
    // 이름이 어긋나면 제목 칸으로 다시 찾는다
    const title = String((ws.getCell(1, 1).value) || '');
    if (title.indexOf(name) < 0) {
      ws = sheets.find(w => String(w.getCell(1, 1).value || '').indexOf(name) >= 0) || ws;
    }
    try { mkAppendExcelBlock(ws, name); } catch (e) { /* 한 명 때문에 전체가 죽지 않게 */ }
  });
}

/** 일괄 엑셀에 '모의고사 통합' 시트 추가 */
function mkAddBatchExcelSheet(wb, names) {
  if (!mkHasData()) return;
  const keys = ME.allExamKeys(mockStudents);
  if (!keys.length) return;

  const ws = wb.addWorksheet('모의고사 통합');
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const nCols = 3 + keys.length + 4;

  ws.mergeCells(1, 1, 1, nCols);
  mkCell(ws, 1, 1, '학급 모의고사 · 수시/정시 통합 요약',
    { font: { bold: true, size: 15, color: { argb: MK_BLUE } }, fill: 'FFEAF2F8' });
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, nCols);
  mkCell(ws, 2, 1, '반영 과목: ' + [...mockWeight].map(a => mkAreaName(a, mkAllExamMetas())).join('·') + '  |  회차 칸의 값은 반영 과목 평균등급입니다 (낮을수록 우수).',
    { font: { bold: true, size: 10 }, fill: 'FFFEF9C3' });

  const hr = 4;
  const heads = ['반', '번호', '이름']
    .concat(keys.map(k => { const m = ME.examMetaOf(mockStudents, k); return m.year + ' ' + m.label; }))
    .concat(['최근 모의', '내신(9등급)', '격차', '판정']);
  heads.forEach((h, i) => {
    mkCell(ws, hr, i + 1, h, { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: i < 3 ? MK_TEAL : MK_PURPLE });
    ws.getColumn(i + 1).width = i < 2 ? 6 : (i === 2 ? 10 : 13);
  });
  ws.getRow(hr).height = 20;

  const list = (names && names.length ? names : Object.keys(mockStudents)).filter(n => mockStudents[n]);
  let r = hr + 1;
  for (const name of list) {
    const stu = mockStudents[name];
    const series = ME.examSeries(stu, mockWeight, mockMergeTamgu);
    const byKey = {};
    series.forEach(e => { byKey[e.key] = e.mainAvg; });
    const recent = series.length ? series[series.length - 1] : null;
    const n9 = naesinAvg9For(name);
    const j = ME.judgeTrack(n9, stu, { weightSet: mockWeight, mergeTamgu: mockMergeTamgu });

    mkCell(ws, r, 1, stu.meta.cls || '');
    mkCell(ws, r, 2, stu.meta.num === null ? '' : stu.meta.num);
    mkCell(ws, r, 3, name, { font: { bold: true, size: 9 }, align: { horizontal: 'left' } });
    keys.forEach((k, i) => {
      const v = byKey[k];
      mkCell(ws, r, 4 + i, (v === null || v === undefined) ? '' : v, { fill: mkGradeFill(v) });
    });
    const c = 4 + keys.length;
    mkCell(ws, r, c, recent ? recent.mainAvg : '', { font: { bold: true, size: 9 } });
    mkCell(ws, r, c + 1, n9 === null ? '' : n9);
    mkCell(ws, r, c + 2, j.delta === null ? '' : (j.delta > 0 ? '+' + j.delta : j.delta),
      { font: { bold: true, size: 9, color: { argb: j.delta === null ? 'FF9CA3AF' : (j.delta > 0 ? 'FF7C3AED' : 'FF0D9488') } } });
    const tColor = j.incomplete ? 'FF9CA3AF' : (j.track.key === 'jeongsi' ? 'FF7C3AED' : (j.track.key === 'susi' ? 'FF0D9488' : 'FFF59E0B'));
    mkCell(ws, r, c + 3, j.incomplete ? '-' : j.track.label, { font: { bold: true, size: 9, color: { argb: tColor } } });
    r++;
  }

  r += 1;
  ws.mergeCells(r, 1, r, nCols);
  mkCell(ws, r, 1, '※ 판정은 내신·모의 평균등급 격차(±0.75등급)에 기반한 참고 지표입니다. 실제 지원은 학생부 내용과 대학별 전형을 함께 검토하세요.',
    { font: { size: 8, italic: true, color: { argb: 'FF92400E' } }, fill: 'FFFFF8EC', align: { horizontal: 'left' }, wrap: true });
  ws.getRow(r).height = 20;
}


// ═══════════════════════════════════════════════
// 탭별 엑셀 내려받기
// ═══════════════════════════════════════════════

function mkSaveWb(wb, filename) {
  return wb.xlsx.writeBuffer().then(buf => {
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  });
}

/** 모의고사 탭 — 학생 개인 회차별 성적 + 학급 통계 */
async function mkDownloadMockExcel() {
  if (!mkHasData()) { showToast('모의고사 자료가 없습니다.'); return; }
  const wb = new ExcelJS.Workbook();
  wb.creator = '고교 성적 나침반 5.0';

  const name = currentStudent;
  if (name && mockStudents[name]) mkAddExcelSheet(wb, name);

  // 학급 통계 시트
  const key = mockDashKey || ME.allExamKeys(mockStudents).slice(-1)[0];
  if (key) {
    const meta = ME.examMetaOf(mockStudents, key);
    const cs = ME.classMockStats(mockStudents, key);
    const areas = Object.keys(cs.bySubject);
    const ws = wb.addWorksheet('학급 통계');
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    const nCols = Math.max(6, areas.length + 1);
    ws.mergeCells(1, 1, 1, nCols);
    mkCell(ws, 1, 1, meta.year + '년 ' + meta.label + ' — 학급 통계',
      { font: { bold: true, size: 15, color: { argb: MK_PURPLE } }, fill: 'FFF5F3FF' });
    ws.getRow(1).height = 28;
    ws.mergeCells(2, 1, 2, nCols);
    mkCell(ws, 2, 1, '응시 ' + cs.count + '명  |  전국 기준선은 9등급제 이론 비율(4·7·12·17·20·17·12·7·4%)입니다.',
      { font: { bold: true, size: 10 }, fill: 'FFFEF9C3' });

    let r = 4;
    const head = ['구분'].concat(areas);
    head.forEach((h, i) => {
      mkCell(ws, r, i + 1, h, { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: i === 0 ? MK_TEAL : MK_PURPLE });
      ws.getColumn(i + 1).width = i === 0 ? 16 : 11;
    });
    r++;
    const rows = [
      ['응시 인원', a => cs.bySubject[a].n],
      ['평균등급', a => cs.bySubject[a].avg],
      ['1~2등급 인원', a => cs.bySubject[a].top2],
      ['1~2등급 비율(%)', a => cs.bySubject[a].top2Ratio],
      ['1~3등급 비율(%)', a => cs.bySubject[a].top3Ratio],
      ['전국 대비 집중도', a => cs.bySubject[a].concentration]
    ];
    for (const [label, fn] of rows) {
      mkCell(ws, r, 1, label, { font: { bold: true, size: 9 }, align: { horizontal: 'left' }, fill: 'FFF3F4F6' });
      areas.forEach((a, i) => mkCell(ws, r, 2 + i, fn(a)));
      r++;
    }

    // 등급별 분포
    r += 1;
    ws.mergeCells(r, 1, r, nCols);
    mkCell(ws, r, 1, '등급별 인원 (괄호는 전국 이론 비율)', { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: MK_TEAL });
    r++;
    mkCell(ws, r, 1, '등급', { font: { bold: true, size: 9 }, fill: 'FFF3F4F6' });
    areas.forEach((a, i) => mkCell(ws, r, 2 + i, a, { font: { bold: true, size: 9 }, fill: 'FFF3F4F6' }));
    r++;
    for (let g = 0; g < 9; g++) {
      mkCell(ws, r, 1, (g + 1) + '등급 (' + ME.NATIONAL_RATIO[g] + '%)', { font: { bold: true, size: 9 }, align: { horizontal: 'left' } });
      areas.forEach((a, i) => {
        const b = cs.bySubject[a];
        mkCell(ws, r, 2 + i, b.dist[g] + '명 / ' + b.ratio[g] + '%', { fill: mkGradeFill(g + 1) });
      });
      r++;
    }
  }

  const fn = '모의고사_' + (name ? name + '_' : '') + (key || '') + '.xlsx';
  await mkSaveWb(wb, fn);
  showToast('모의고사 엑셀을 내려받았습니다.');
}

/** 수시·정시 통합 탭 — 판정 + 대비 + 정시 라인 */
async function mkDownloadFusionExcel() {
  const name = currentStudent;
  if (!name || !mockStudents[name]) { showToast('모의고사 성적이 있는 학생을 선택해 주세요.'); return; }

  const n9 = naesinAvg9For(name);
  const j = ME.judgeTrack(n9, mockStudents[name], { weightSet: mockWeight, mergeTamgu: mockMergeTamgu, naesinTrend: naesinTrend9(name) });

  const wb = new ExcelJS.Workbook();
  wb.creator = '고교 성적 나침반 5.0';
  const ws = wb.addWorksheet('수시 정시 통합');
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const N = 6;
  [18, 14, 14, 14, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.mergeCells(1, 1, 1, N);
  mkCell(ws, 1, 1, name + ' — 수시 · 정시 성향 분석',
    { font: { bold: true, size: 15, color: { argb: MK_PURPLE } }, fill: 'FFF5F3FF' });
  ws.getRow(1).height = 28;

  let r = 3;
  ws.mergeCells(r, 1, r, N);
  mkCell(ws, r, 1, j.incomplete ? '판정 불가 — 내신과 모의고사가 모두 필요합니다' : ('판정: ' + j.track.label),
    { font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }, fill: j.incomplete ? 'FF9CA3AF' : MK_PURPLE });
  ws.getRow(r).height = 24; r += 2;

  if (!j.incomplete) {
    ['항목', '값', '읽는 법'].forEach((h, i) =>
      mkCell(ws, r, i + 1, h, { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_TEAL }));
    r++;
    const tbl = [
      ['내신 (9등급 환산)', mkFix(j.naesin9) + '등급', '고1·2 5등급제는 백분위를 9등급 커트에 대입해 환산'],
      ['모의 (반영 과목 평균)', mkFix(j.mockAvg) + '등급', [...mockWeight].map(a => mkAreaName(a, j.series)).join('·') + ' 평균'],
      ['격차 Δ', (j.delta > 0 ? '+' : '') + mkFix(j.delta), '+0.75 이상 정시 우위 / −0.75 이하 수시 우위'],
      ['상위 3개 등급합', j.best3Sum === undefined ? '-' : j.best3Sum, '수능 최저 충족 가늠 (합 6~7이면 주요대 유력)']
    ];
    for (const [a, b, c] of tbl) {
      mkCell(ws, r, 1, a, { font: { bold: true, size: 9 }, align: { horizontal: 'left' }, fill: 'FFF3F4F6' });
      mkCell(ws, r, 2, b, { font: { bold: true, size: 10 } });
      ws.mergeCells(r, 3, r, N);
      mkCell(ws, r, 3, c, { font: { size: 9, color: { argb: 'FF6B7280' } }, align: { horizontal: 'left' }, wrap: true });
      r++;
    }
    r++;
    ws.mergeCells(r, 1, r, N);
    mkCell(ws, r, 1, '판정 근거', { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: MK_TEAL });
    r++;
    for (const reason of j.reasons) {
      ws.mergeCells(r, 1, r, N);
      mkCell(ws, r, 1, '· ' + reason, { font: { size: 9 }, align: { horizontal: 'left' }, wrap: true });
      ws.getRow(r).height = 16; r++;
    }

    // 학기·회차 대비
    r += 1;
    ws.mergeCells(r, 1, r, N);
    mkCell(ws, r, 1, '내신 학기별 (9등급 환산)', { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: MK_TEAL });
    r++;
    const terms = naesinTermAvg9(name);
    terms.forEach((t, i) => { mkCell(ws, r, 1 + i, t.term, { font: { bold: true, size: 9 }, fill: 'FFF3F4F6' }); });
    r++;
    terms.forEach((t, i) => { mkCell(ws, r, 1 + i, t.avg, { font: { bold: true, size: 10 }, fill: mkGradeFill(t.avg) }); });
    r += 2;

    ws.mergeCells(r, 1, r, N);
    mkCell(ws, r, 1, '모의고사 회차별 (반영 과목 평균)', { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: MK_PURPLE });
    r++;
    j.series.forEach((e, i) => { mkCell(ws, r, 1 + i, e.year + ' ' + e.label, { font: { bold: true, size: 9 }, fill: 'FFF3F4F6' }); });
    r++;
    j.series.forEach((e, i) => { mkCell(ws, r, 1 + i, e.mainAvg, { font: { bold: true, size: 10 }, fill: mkGradeFill(e.mainAvg) }); });
    r += 2;

    const est = ME.estimateJeongsiLine(j.series[j.series.length - 1], MOCK_UNIV_LINES);
    if (est) {
      ws.mergeCells(r, 1, r, N);
      mkCell(ws, r, 1, '정시 추정 라인 (참고용): 국수영탐 백분위 평균 ' + est.pctAvg + ' → ' + est.line.group,
        { font: { bold: true, size: 11, color: { argb: MK_PURPLE } }, fill: 'FFF5F3FF', align: { horizontal: 'left' } });
      r++;
      ws.mergeCells(r, 1, r, N);
      mkCell(ws, r, 1, est.line.example, { font: { size: 9 }, align: { horizontal: 'left' } });
      r++;
      ws.mergeCells(r, 1, r, N);
      mkCell(ws, r, 1, '※ ' + est.disclaimer + ' 기준표: ' + est.source,
        { font: { size: 8, italic: true, color: { argb: 'FF92400E' } }, fill: 'FFFFF8EC', align: { horizontal: 'left' }, wrap: true });
      ws.getRow(r).height = 26;
    }
  } else {
    for (const reason of j.reasons) {
      ws.mergeCells(r, 1, r, N);
      mkCell(ws, r, 1, '· ' + reason, { font: { size: 9 }, align: { horizontal: 'left' }, wrap: true });
      r++;
    }
  }

  await mkSaveWb(wb, '수시정시통합_' + name + '.xlsx');
  showToast('통합 분석 엑셀을 내려받았습니다.');
}

/* ══════════════ 모의고사/mock-pdf.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   모의고사 PDF 파서 (mock-pdf.js)
   ───────────────────────────────────────────────────────────────
   전국연합학력평가 공식 PDF를 직접 읽는다. pdf.js 전역이 필요하다.

   지원 양식 (첫 페이지 제목으로 자동 판별)
     · 성적통지표(학생용)  — 페이지당 학생 1명. 원점수·표준점수·학급/학교석차·백분위·등급
     · 성적일람표(학급별)  — 페이지당 학급 전체. 표준점수·학교석차·백분위·등급 (원점수 없음)

   pdf.js는 글자 하나하나를 개별 아이템으로 내보낸다.
   y로 줄을 묶고 x 간격으로 셀을 다시 붙인 뒤, 열 위치(x 밴드)로 값을 읽는다.
   ═══════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════
// 텍스트 재조립
// ═══════════════════════════════════════════════

/** 글자 아이템 → 줄 배열. 각 줄은 x순으로 정렬된 셀 목록. */
function mkPdfRows(items) {
  const its = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    its.push({
      s: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width || 0,
      h: it.height || Math.abs(it.transform[3]) || 10
    });
  }
  its.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  // y가 비슷하면 같은 줄
  const lines = [];
  for (const it of its) {
    const tol = Math.max(1.5, it.h * 0.4);
    let ln = null;
    for (const l of lines) { if (Math.abs(l.y - it.y) <= tol) { ln = l; break; } }
    if (ln) ln.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);

  // 줄 안에서 x 간격이 좁으면 한 셀로 합친다
  return lines.map(ln => {
    ln.items.sort((a, b) => a.x - b.x);
    const cells = [];
    let cur = null;
    for (const it of ln.items) {
      if (cur && (it.x - (cur.x + cur.w)) <= Math.max(1.0, cur.h * 0.45)) {
        cur.s += it.s;
        cur.w = (it.x + it.w) - cur.x;
      } else {
        if (cur) cells.push(cur);
        cur = { s: it.s, x: it.x, w: it.w, h: it.h };
      }
    }
    if (cur) cells.push(cur);
    return {
      y: Math.round(ln.y),
      cells: cells.map(c => ({ s: c.s.replace(/\s+/g, ''), x: Math.round(c.x) })).filter(c => c.s !== '')
    };
  });
}

/** PDF 전체를 페이지별 줄 배열로 */
async function mkPdfExtract(arrayBuffer, onProgress) {
  if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js가 로드되지 않았습니다');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(mkPdfRows(tc.items));
    page.cleanup();
    if (onProgress) onProgress(i, doc.numPages);
  }
  try { doc.destroy(); } catch (e) {}
  return pages;
}

// ═══════════════════════════════════════════════
// 공통 헬퍼
// ═══════════════════════════════════════════════

/** 한 줄에서 x 범위 안의 첫 셀 */
function mkCellAt(row, lo, hi, re) {
  for (const c of row.cells) {
    if (c.x >= lo && c.x <= hi && (!re || re.test(c.s))) return c.s;
  }
  return null;
}
/** x가 lo 미만인 셀들을 이어붙인다 (세로쓰기 영역 라벨) */
function mkLabelOf(row, lo) {
  return row.cells.filter(c => c.x < lo).map(c => c.s).join('');
}

const MK_RE_NUM = /^-?\d+(\.\d+)?$/;
const MK_RE_FRAC = /^(\d+)\/(\d+)$/;
// 개인정보 보호로 가운데 글자가 가려진 이름(이*희)도 받는다
const MK_RE_NAME = /^[가-힣A-Za-z*][가-힣A-Za-z*]{1,9}$/;
// 미응시 표기
function mkIsBlank(s) { return s === '-' || s === '–' || s === '—' || s === '·' || s === ''; }

function mkNumOr(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }

/**
 * 영역 라벨 → 표준 영역 + 표시명.
 * 고1·2 학평의 '사회'/'과학'은 탐구 슬롯으로 넣는다. 통합사회·통합과학 이름은 ME.applyCurriculum이 붙인다.
 */
function mkPdfArea(label, tamguUsed) {
  const n = String(label || '').replace(/\s/g, '');
  if (n === '사회' || n === '사회탐구') return { area: '탐구1', sel: '사회탐구' };
  if (n === '과학' || n === '과학탐구') return { area: '탐구2', sel: '과학탐구' };
  const a = ME.normalizeArea(n);
  if (a) return { area: a, sel: (a.indexOf('탐구') === 0 && n !== a) ? n : null };
  // 알 수 없는 이름 = 실제 탐구 과목명 (생활과윤리 등) → 빈 탐구 슬롯에
  if (n && !/^(영역|구분|합계|평균)$/.test(n)) {
    const slot = tamguUsed.has('탐구1') ? (tamguUsed.has('탐구2') ? null : '탐구2') : '탐구1';
    if (slot) return { area: slot, sel: n };
  }
  return null;
}

/** 제목·실시일에서 회차 메타를 뽑는다 */
function mkPdfExamMeta(pages) {
  const flat = pages[0].map(r => r.cells.map(c => c.s).join(' ')).join(' ');
  const title = flat.replace(/\s/g, '');

  let gy = null;
  const mg = title.match(/고(\d)/);
  if (mg) gy = parseInt(mg[1], 10);

  // 실시일 우선 (2026.9.2.)
  let year = null, month = null;
  const md = flat.match(/(20\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\./);
  if (md) { year = parseInt(md[1], 10); month = parseInt(md[2], 10); }
  if (month === null) {
    const mm = title.match(/(\d{1,2})월/);
    if (mm) month = parseInt(mm[1], 10);
    const my = title.match(/(20\d{2})학년도/);
    if (my) year = parseInt(my[1], 10);
  }
  if (!year) year = new Date().getFullYear();
  if (!month) month = 3;

  const meta = ME.makeExamMeta(year, month, gy || 3);
  // 제목에 학년이 없으면 비워 두고 성적표 본문에서 채운다 (공통 체제 판별에 학년이 필요하다)
  meta.gy = gy;
  // 제목이 평가원/수능이면 주관처를 덮어쓴다
  if (/수능/.test(title) && !/모의/.test(title)) { meta.org = '수능'; meta.label = '수능'; }
  else if (/모의평가/.test(title)) { meta.org = '평가원'; meta.label = month + '월 모의평가'; }
  else if (/전국연합/.test(title)) { meta.org = '교육청'; meta.label = month + '월 학력평가'; }
  meta.fullLabel = year + '년 ' + month + '월 ' + (ME.ORG_LABEL[meta.org] || meta.org);
  return meta;
}

/** 첫 페이지 제목으로 양식 판별 */
function mkPdfKind(pages) {
  const t = pages[0].map(r => r.cells.map(c => c.s).join('')).join('').replace(/\s/g, '');
  if (t.indexOf('성적통지표') >= 0) return 'report';
  if (t.indexOf('성적일람표') >= 0) return 'roster';
  return null;
}

// ═══════════════════════════════════════════════
// ① 성적통지표 (학생용) — 페이지당 1명
// ═══════════════════════════════════════════════

// 열 x 밴드 (A4 가로 841pt 기준). 여유 있게 잡았다.
const MK_RPT_COL = {
  max:     [118, 155],   // 배점
  raw:     [158, 198],   // 득점(원점수)
  range:   [199, 232],   // 범위 (상대평가만)
  std:     [236, 275],   // 표준점수
  clsRank: [276, 308],   // 학급석차 a/b
  schRank: [309, 348],   // 학교석차 a/b
  pct:     [349, 392],   // 전국백분위
  grade:   [396, 422],   // 등급
  total:   [424, 460]    // 응시자수
};

function mkParseReportPage(rows) {
  // 학생 식별: '실시일' 라벨 줄 다음 줄에 값들이 온다
  let hdr = -1;
  for (let i = 0; i < rows.length; i++) {
    const j = rows[i].cells.map(c => c.s).join('');
    if (j.indexOf('학년') >= 0 && j.indexOf('반') >= 0 && j.indexOf('실') >= 0) { hdr = i; break; }
  }
  if (hdr < 0 || hdr + 1 >= rows.length) return null;

  const vr = rows[hdr + 1];
  const school = mkCellAt(vr, 300, 460, /학교$/);
  const gy = mkNumOr(mkCellAt(vr, 520, 570, MK_RE_NUM));
  const cls = mkNumOr(mkCellAt(vr, 571, 610, MK_RE_NUM));
  const num = mkNumOr(mkCellAt(vr, 611, 655, MK_RE_NUM));
  const name = mkCellAt(vr, 656, 720, MK_RE_NAME);
  if (!name) return null;

  const subjects = {};
  const tamguUsed = new Set();

  for (const row of rows) {
    // 영역 데이터 줄: 배점·득점 밴드에 숫자가 있어야 한다
    const mx = mkCellAt(row, MK_RPT_COL.max[0], MK_RPT_COL.max[1], MK_RE_NUM);
    const raw = mkCellAt(row, MK_RPT_COL.raw[0], MK_RPT_COL.raw[1], MK_RE_NUM);
    if (mx === null || raw === null) continue;

    const hit = mkPdfArea(mkLabelOf(row, 115), tamguUsed);
    if (!hit) continue;

    const rec = { raw: mkNumOr(raw), max: mkNumOr(mx) };
    const std = mkCellAt(row, MK_RPT_COL.std[0], MK_RPT_COL.std[1], MK_RE_NUM);
    if (std !== null) rec.std = mkNumOr(std);

    const cr = mkCellAt(row, MK_RPT_COL.clsRank[0], MK_RPT_COL.clsRank[1], MK_RE_FRAC);
    if (cr) { const m = cr.match(MK_RE_FRAC); rec.clsRank = +m[1]; rec.clsN = +m[2]; }
    const sr = mkCellAt(row, MK_RPT_COL.schRank[0], MK_RPT_COL.schRank[1], MK_RE_FRAC);
    if (sr) { const m = sr.match(MK_RE_FRAC); rec.schRank = +m[1]; rec.schN = +m[2]; }

    const pct = mkCellAt(row, MK_RPT_COL.pct[0], MK_RPT_COL.pct[1], MK_RE_NUM);
    if (pct !== null) rec.pct = mkNumOr(pct);
    const g = mkCellAt(row, MK_RPT_COL.grade[0], MK_RPT_COL.grade[1], /^[1-9]$/);
    if (g !== null) rec.grade = mkNumOr(g);
    if (hit.sel) rec.sel = hit.sel;

    if (rec.grade === null && rec.pct === null && rec.raw === null) continue;
    subjects[hit.area] = ME.fillSubject(hit.area, rec);
    if (hit.area.indexOf('탐구') === 0) tamguUsed.add(hit.area);
  }

  if (!Object.keys(subjects).length) return null;
  return {
    name: name,
    meta: { name: name, uid: null, cls: cls === null ? null : String(cls), num: num, school: school, gy: gy },
    subjects: subjects
  };
}

// ═══════════════════════════════════════════════
// ② 성적일람표 (학급별) — 페이지당 여러 명
// ═══════════════════════════════════════════════

/**
 * 학생 줄: 번호 · 성명 · 이후 숫자들.
 * 열 구성은 머리글(국어영역/수학영역/… + 표준점수/학교석차/전국백분위/등급)에서 읽어낸다.
 * 실무상 배치가 고정이라, 숫자 개수로 영역 묶음을 판별하는 쪽이 더 튼튼하다.
 *   4개 묶음 = 표준점수·학교석차·백분위·등급 (상대평가)
 *   1개      = 등급만 (절대평가: 영어·한국사)
 */
function mkParseRosterPage(rows, order) {
  const out = [];
  for (const row of rows) {
    const cells = row.cells;
    if (cells.length < 8) continue;
    const num = cells[0] && /^\d{1,2}$/.test(cells[0].s) ? parseInt(cells[0].s, 10) : null;
    const name = cells[1] && MK_RE_NAME.test(cells[1].s) ? cells[1].s : null;
    if (num === null || !name) continue;

    // 미응시 칸('-')은 null로 두되 자릿수는 유지해야 열이 밀리지 않는다
    const nums = [];
    let bad = false;
    for (let i = 2; i < cells.length; i++) {
      const s = cells[i].s;
      if (mkIsBlank(s)) { nums.push(null); continue; }
      if (!MK_RE_NUM.test(s)) { bad = true; break; }
      nums.push(parseFloat(s));
    }
    if (bad) continue;
    // order가 요구하는 숫자 개수와 맞아야 학생 줄로 인정
    const need = order.reduce((a, o) => a + (o.abs ? 1 : 4), 0);
    if (nums.length !== need) continue;

    const subjects = {};
    const tamguUsed = new Set();
    let k = 0;
    for (const o of order) {
      const hit = mkPdfArea(o.label, tamguUsed);
      if (!hit) { k += o.abs ? 1 : 4; continue; }
      let rec;
      if (o.abs) rec = { grade: nums[k] };
      else rec = { std: nums[k], schRank: nums[k + 1], pct: nums[k + 2], grade: nums[k + 3] };
      k += o.abs ? 1 : 4;
      // 미응시 영역은 담지 않는다
      if (rec.grade === null && (rec.pct === null || rec.pct === undefined)) continue;
      if (hit.sel) rec.sel = hit.sel;
      subjects[hit.area] = ME.fillSubject(hit.area, rec);
      if (hit.area.indexOf('탐구') === 0) tamguUsed.add(hit.area);
    }
    if (Object.keys(subjects).length) {
      out.push({ name: name, meta: { name: name, uid: null, cls: null, num: num }, subjects: subjects });
    }
  }
  return out;
}

/** 일람표 머리글에서 영역 순서를 읽는다 */
function mkRosterOrder(rows) {
  // '국어영역 · 수학영역 · 영어영역 · 한국사영역' 줄 + '사회 · 과학' 줄
  const order = [];
  let areaRow = null, tamguRow = null;
  for (const r of rows) {
    const j = r.cells.map(c => c.s).join('');
    if (areaRow === null && /국어영역/.test(j) && /수학영역/.test(j)) areaRow = r;
    if (tamguRow === null && /^사회과학$|사회.*과학/.test(j) && j.length <= 8) tamguRow = r;
  }
  if (!areaRow) return null;

  const abs = new Set(['영어', '한국사']);
  for (const c of areaRow.cells) {
    const nm = c.s.replace(/영역$/, '');
    if (!nm) continue;
    order.push({ label: nm, x: c.x, abs: abs.has(nm) });
  }
  if (tamguRow) for (const c of tamguRow.cells) order.push({ label: c.s, x: c.x, abs: false });
  order.sort((a, b) => a.x - b.x);
  return order;
}

/** 일람표 머리 정보(학년·반·학교명) */
function mkRosterHead(rows) {
  for (let i = 0; i < rows.length; i++) {
    const j = rows[i].cells.map(c => c.s).join('');
    if (/학년/.test(j) && /반/.test(j) && /학교명/.test(j)) {
      // 머리글 바로 다음 줄이 값이 아닐 수 있다(영역명 줄이 끼어든다).
      // 학교명 셀이 보이는 줄을 앞으로 몇 줄 훑어서 찾는다.
      for (let k = i + 1; k < Math.min(i + 5, rows.length); k++) {
        const v = rows[k];
        const school = mkCellAt(v, 100, 260, /학교$/);
        if (!school) continue;
        return {
          gy: mkNumOr(mkCellAt(v, 20, 50, MK_RE_NUM)),
          cls: mkNumOr(mkCellAt(v, 50, 90, MK_RE_NUM)),
          school: school
        };
      }
      return {};
    }
  }
  return {};
}

// ═══════════════════════════════════════════════
// 진입점
// ═══════════════════════════════════════════════

/**
 * PDF 한 개를 파싱한다.
 * @returns { students, meta, kind, pageCount, warnings }
 */
async function mkParsePdf(arrayBuffer, onProgress) {
  const pages = await mkPdfExtract(arrayBuffer, onProgress);
  if (!pages.length) throw new Error('빈 PDF입니다');
  // 스캔·사진 PDF는 글자 층이 없어 셀이 하나도 안 나온다
  if (!pages.some(rows => rows.some(r => r.cells.length))) {
    throw new Error('글자를 읽을 수 없는 PDF입니다. 스캔하거나 사진으로 만든 PDF는 읽지 못합니다. 성적 시스템에서 내려받은 원본 PDF를 올려 주세요.');
  }

  const kind = mkPdfKind(pages);
  if (!kind) throw new Error('전국연합학력평가 성적통지표 또는 성적일람표가 아닌 것 같습니다. 스캔본이 아닌 원본 PDF인지도 확인해 주세요.');

  const meta = mkPdfExamMeta(pages);
  const students = {};
  const warnings = [];
  let parsed = 0;

  if (kind === 'report') {
    for (let i = 0; i < pages.length; i++) {
      const r = mkParseReportPage(pages[i]);
      if (!r) { warnings.push((i + 1) + '쪽을 읽지 못했습니다' + (pages[i].some(row => row.cells.length) ? '' : ' (글자가 없는 쪽 — 스캔본?)')); continue; }
      parsed++;
      if (r.meta.gy && !meta.gy) meta.gy = r.meta.gy;
      // 동명이인 대비: 반·번호가 있으면 그것으로 고유 키를 잡는다 (불러올 때 이름으로 되돌린다)
      const key = (r.meta.cls && r.meta.num) ? r.meta.cls + '-' + r.meta.num + '-' + r.name : r.name;
      const ex = Object.assign({}, meta, { subjects: r.subjects });
      if (students[key]) Object.assign(students[key].exams[meta.key].subjects, r.subjects);
      else students[key] = { meta: r.meta, exams: { [meta.key]: ex } };
    }
  } else {
    const order = mkRosterOrder(pages[0]);
    if (!order) throw new Error('일람표 머리글(국어영역·수학영역 …)을 찾지 못했습니다');
    const head = mkRosterHead(pages[0]);
    if (head.gy && !meta.gy) meta.gy = head.gy;
    for (const pg of pages) {
      for (const r of mkParseRosterPage(pg, order)) {
        parsed++;
        r.meta.cls = head.cls === null || head.cls === undefined ? null : String(head.cls);
        r.meta.school = head.school || null;
        const key = (r.meta.cls && r.meta.num) ? r.meta.cls + '-' + r.meta.num + '-' + r.name : r.name;
        const ex = Object.assign({}, meta, { subjects: r.subjects });
        if (students[key]) Object.assign(students[key].exams[meta.key].subjects, r.subjects);
        else students[key] = { meta: r.meta, exams: { [meta.key]: ex } };
      }
    }
  }

  if (!parsed) throw new Error('학생 성적을 한 명도 읽지 못했습니다');
  return { students: students, meta: meta, kind: kind, pageCount: pages.length, parsed: parsed, warnings: warnings };
}

/* ══════════════ 모의고사/mock-store.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   로컬 저장 (mock-store.js)
   ───────────────────────────────────────────────────────────────
   올린 성적을 브라우저(localStorage)에 남겨 두었다가 다음에 열면 복원한다.

   · 자동 저장 — 파일을 올리거나 분석을 실행하면 바로 저장된다
   · 수동 삭제 — 좌측 1번 섹션의 「저장분 삭제」 버튼으로만 지워진다. 내신·모의 회차를 골라 지울 수 있다
   · 브라우저 밖으로 나가지 않는다. 서버 전송 없음.

   ⚠ 학생 개인정보가 그 PC에 남는다. 공용 PC에서는 쓰고 나서 삭제할 것.
   ═══════════════════════════════════════════════════════════════ */

const MK_STORE_KEY = 'gradeFactory.v1';
const MK_STORE_LIMIT = 4.6 * 1024 * 1024;   // localStorage 5MB 한도 여유분
let mkStoreEnabled = true;                   // 저장 실패가 반복되면 끈다
let mkStoreLast = null;                      // 마지막 저장 시각
let mkStoreDelOpen = false;                  // 「저장분 삭제」 고르기 패널이 열려 있나
let mkResetQuiet = false;                    // 골라 지운 뒤 화면을 다시 짤 때 초기화 확인창을 건너뛴다

/** localStorage를 쓸 수 있는지 (사생활 보호 모드·차단 대비) */
function mkStoreAvailable() {
  try {
    const k = '__gf_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
}

function mkBytes(n) {
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + 'KB';
  return (n / 1024 / 1024).toFixed(1) + 'MB';
}

function mkNowStr() {
  const d = new Date();
  const p = v => String(v).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ═══════════════════════════════════════════════
// 저장
// ═══════════════════════════════════════════════
function mkStoreSave(silent) {
  if (!mkStoreEnabled || !mkStoreAvailable()) return false;

  const naesinN = Object.keys(allStudents || {}).length;
  const mockN = Object.keys(mockStudents || {}).length;
  if (!naesinN && !mockN) { mkStoreClear(true); return false; }

  const payload = {
    v: 1,
    savedAt: new Date().toISOString(),
    naesin: naesinN ? {
      students: allStudents,
      fileName: lastFileName || '',
      fileType: currentFileType,
      schoolLevel: currentSchoolLevel,
      ilamData: ilamData,
      achOnly: (typeof nsAchOnly !== 'undefined') ? nsAchOnly : {},  // 성취도만 있는 과목 (내신/naesin-ui.js)
      nums: (typeof stuNos !== 'undefined') ? stuNos : {}             // 학생 번호 (ui/shell.js) — 원본 시트는 저장하지 않으므로
    } : null,
    mock: mockN ? {
      students: mockStudents,
      weight: [...mockWeight],
      mergeTamgu: mockMergeTamgu,
      dashKey: mockDashKey
    } : null,
    ui: {
      career: (document.getElementById('career-inp') || {}).value || '',
      memo: (document.getElementById('memo-inp') || {}).value || '',
      student: currentStudent || ''
    }
  };

  let json;
  try { json = JSON.stringify(payload); }
  catch (e) { console.warn('[저장] 직렬화 실패', e); return false; }

  if (json.length > MK_STORE_LIMIT) {
    if (!silent) showToast('데이터가 너무 커서(' + mkBytes(json.length) + ') 저장하지 못했습니다.');
    return false;
  }
  try {
    localStorage.setItem(MK_STORE_KEY, json);
    mkStoreLast = payload.savedAt;
    mkStoreRender();
    return true;
  } catch (e) {
    mkStoreEnabled = false;
    if (!silent) showToast('브라우저 저장 공간이 가득 찼습니다. 「저장분 삭제」 후 다시 시도하세요.');
    console.warn('[저장] 실패', e);
    return false;
  }
}

/** 저장된 내용 메타 정보 */
function mkStoreInfo() {
  if (!mkStoreAvailable()) return { ok: false, reason: 'unavailable' };
  let json;
  try { json = localStorage.getItem(MK_STORE_KEY); } catch (e) { return { ok: false, reason: 'unavailable' }; }
  if (!json) return { ok: false, reason: 'empty' };
  try {
    const p = JSON.parse(json);
    return {
      ok: true,
      savedAt: p.savedAt,
      bytes: json.length,
      naesin: p.naesin ? Object.keys(p.naesin.students || {}).length : 0,
      mock: p.mock ? Object.keys(p.mock.students || {}).length : 0,
      exams: p.mock ? [...new Set(Object.values(p.mock.students || {}).flatMap(s => Object.keys(s.exams || {})))].length : 0,
      fileName: p.naesin ? p.naesin.fileName : ''
    };
  } catch (e) { return { ok: false, reason: 'corrupt' }; }
}

// ═══════════════════════════════════════════════
// 복원
// ═══════════════════════════════════════════════
function mkStoreLoad(announce) {
  const info = mkStoreInfo();
  if (!info.ok) return false;

  let p;
  try { p = JSON.parse(localStorage.getItem(MK_STORE_KEY)); }
  catch (e) { return false; }

  try {
    // ── 모의고사 ──
    if (p.mock && p.mock.students) {
      mockStudents = p.mock.students;
      // 예전에 저장한 고1·2 회차도 탐구 이름을 통합사회·통합과학으로 맞춘다
      Object.values(mockStudents).forEach(s => Object.values(s.exams || {}).forEach(ME.applyCurriculum));
      if (Array.isArray(p.mock.weight) && p.mock.weight.length) mockWeight = new Set(p.mock.weight);
      mockMergeTamgu = !!p.mock.mergeTamgu;
      const keys = ME.allExamKeys(mockStudents);
      mockDashKey = (p.mock.dashKey && keys.indexOf(p.mock.dashKey) >= 0) ? p.mock.dashKey : (keys[keys.length - 1] || null);
      mkRenderChips();
      mkUpdateTabBadges();
    }

    // ── 내신 ──
    if (p.naesin && p.naesin.students) {
      currentFileType = p.naesin.fileType || 'neis';
      currentSchoolLevel = p.naesin.schoolLevel || 'high';
      ilamData = p.naesin.ilamData || null;
      lastFileName = p.naesin.fileName || '저장된 데이터';
      selectSchoolLevel(currentSchoolLevel);
      selectFileType(currentFileType);
      if (typeof stuNos !== 'undefined') stuNos = p.naesin.nums || {};
      // 저장분은 이미 합쳐진 결과다 — 지금 화면의 내신과 또 합치지 말고 통째로 바꾼다
      if (typeof nsMergeOff !== 'undefined') nsMergeOff = true;
      try { applyParseResult(p.naesin.students, currentFileType === 'ilam', currentSchoolLevel === 'middle'); }
      finally { if (typeof nsMergeOff !== 'undefined') nsMergeOff = false; }
      if (typeof nsAchOnly !== 'undefined') nsAchOnly = p.naesin.achOnly || {};
    }

    // 모의만 있을 때도 학생 목록이 뜨도록
    mkSyncStudentSelect();

    // ── 입력값 ──
    if (p.ui) {
      const c = document.getElementById('career-inp'); if (c) c.value = p.ui.career || '';
      const m = document.getElementById('memo-inp'); if (m) m.value = p.ui.memo || '';
      const sel = document.getElementById('stu-sel');
      if (p.ui.student && sel && [...sel.options].some(o => o.value === p.ui.student)) {
        sel.value = p.ui.student;
        onStudentChange();
      }
    }

    mkStoreLast = p.savedAt;
    mkStoreRender();
    if (announce) {
      const parts = [];
      if (info.naesin) parts.push('내신 ' + info.naesin + '명');
      if (info.mock) parts.push('모의 ' + info.mock + '명/' + info.exams + '회차');
      showToast('저장된 데이터를 불러왔습니다 — ' + parts.join(' · '));
    }
    return true;
  } catch (e) {
    console.error('[복원] 실패', e);
    showToast('저장된 데이터를 불러오지 못했습니다. 손상되었을 수 있습니다.');
    return false;
  }
}

// ═══════════════════════════════════════════════
// 삭제
// ═══════════════════════════════════════════════
function mkStoreClear(silent) {
  try { localStorage.removeItem(MK_STORE_KEY); } catch (e) {}
  mkStoreEnabled = true;
  mkStoreLast = null;
  mkStoreRender();
  if (!silent) showToast('저장된 성적 데이터를 지웠습니다.');
  return true;
}

// ═══════════════════════════════════════════════
// 골라 지우기 — 내신 / 모의 회차별
// ═══════════════════════════════════════════════
// 저장분만 지우고 화면에 남겨 두면 다음 자동 저장 때 되살아난다.
// 그래서 고른 것을 저장분에서 빼고, 화면은 남은 저장분으로 다시 짠다.

function mkStorePayload() {
  try { return JSON.parse(localStorage.getItem(MK_STORE_KEY)); } catch (e) { return null; }
}

/** 지울 수 있는 항목: [{ id, kind, title, sub }] */
function mkStoreDelItems(p) {
  const items = [];
  if (!p) return items;
  if (p.naesin && p.naesin.students) {
    // 교과학습발달상황(확정)과 일람표(예상)를 합쳐 두었으면 따로 지울 수 있게 나눈다
    const part = prov => {
      const names = new Set(), terms = new Set();
      Object.entries(p.naesin.students).forEach(([n, subj]) => Object.values(subj || {}).forEach(d => {
        if (!!(d && d.isIlam) !== prov) return;
        names.add(n); terms.add(d.term);
      }));
      return { n: names.size, terms: [...terms].sort() };
    };
    const fin = part(false), pv = part(true);
    const span = ts => ts.length ? (ts.length > 1 ? ts[0] + ' ~ ' + ts[ts.length - 1] : ts[0]) + ' · ' : '';
    if (fin.n && pv.n) {
      items.push({ id: 'naesin:final', kind: '내신', title: '교과학습발달상황 (확정)', sub: span(fin.terms) + fin.n + '명' });
      items.push({ id: 'naesin:prov', kind: '내신', title: '전과목 성적 일람표 (예상)', sub: span(pv.terms) + pv.n + '명' });
    } else {
      const n = Object.keys(p.naesin.students).length;
      const ft = pv.n ? '전과목 성적 일람표' : '교과학습발달상황';
      items.push({ id: 'naesin', kind: '내신', title: ft, sub: (p.naesin.fileName ? p.naesin.fileName + ' · ' : '') + n + '명' });
    }
  }
  if (p.mock && p.mock.students && typeof ME !== 'undefined') {
    ME.allExamKeys(p.mock.students).forEach(k => {
      const m = ME.examMetaOf(p.mock.students, k) || {};
      let n = 0;
      Object.values(p.mock.students).forEach(s => { if (s.exams && s.exams[k]) n++; });
      items.push({ id: 'exam:' + k, kind: '모의', title: (m.year ? m.year + ' ' : '') + (m.label || k), sub: n + '명' });
    });
  }
  return items;
}

function mkStoreDelHtml() {
  const items = mkStoreDelItems(mkStorePayload());
  if (!items.length) return '';
  return '<div class="mk-store-del">' +
    '<div class="hd">지울 자료를 고르세요</div>' +
    items.map(it => '<label class="it"><input type="checkbox" data-id="' + mkEsc(it.id) + '" onchange="mkStoreDelCount()">' +
      '<span class="k ' + (it.kind === '내신' ? 'ns' : 'mk') + '">' + it.kind + '</span>' +
      '<span class="t"><b>' + mkEsc(it.title) + '</b><small>' + mkEsc(it.sub) + '</small></span></label>').join('') +
    (items.length > 1 ? '<label class="it all"><input type="checkbox" onchange="mkStoreDelAll(this.checked)"><span class="t"><b>모두 선택</b></span></label>' : '') +
    '<div class="nt">지운 자료는 화면에서도 빠지고 되돌릴 수 없습니다. 원본 파일은 그대로입니다.</div>' +
    '<div class="mk-store-acts">' +
    '<button onclick="mkStoreDelToggle(false)">취소</button>' +
    '<button class="danger" id="mk-store-del-go" onclick="mkStoreDelGo()" disabled>' + ic('trash', 13) + ' 삭제</button>' +
    '</div></div>';
}

function mkStoreDelToggle(open) {
  const info = mkStoreInfo();
  if (open && !info.ok) { showToast('지울 저장 데이터가 없습니다.'); return; }
  mkStoreDelOpen = !!open;
  mkStoreRender();
}

function mkStoreDelPicked() {
  return [...document.querySelectorAll('.mk-store-del input[data-id]')].filter(x => x.checked).map(x => x.dataset.id);
}
function mkStoreDelAll(on) {
  document.querySelectorAll('.mk-store-del input[data-id]').forEach(x => { x.checked = on; });
  mkStoreDelCount();
}
function mkStoreDelCount() {
  const n = mkStoreDelPicked().length;
  const total = document.querySelectorAll('.mk-store-del input[data-id]').length;
  const all = document.querySelector('.mk-store-del .all input');
  if (all) all.checked = n === total;
  const go = document.getElementById('mk-store-del-go');
  if (go) {
    go.disabled = !n;
    go.innerHTML = ic('trash', 13) + (n ? ' ' + (n === total ? '전부' : n + '개') + ' 삭제' : ' 삭제');
  }
}

function mkStoreDelGo() {
  const picked = mkStoreDelPicked();
  if (!picked.length) return;
  const p = mkStorePayload();
  if (!p) { mkStoreDelToggle(false); return; }
  const items = mkStoreDelItems(p);
  const names = items.filter(it => picked.indexOf(it.id) >= 0).map(it => '  · ' + it.kind + ' ' + it.title + ' (' + it.sub + ')');
  if (!confirm('이 브라우저에 저장된 아래 자료를 지웁니다.\n\n' + names.join('\n') +
    '\n\n화면에서도 빠지고 되돌릴 수 없습니다. 계속할까요?')) return;

  // 1) 저장분에서 빼기
  if (picked.indexOf('naesin') >= 0) p.naesin = null;
  ['naesin:final', 'naesin:prov'].forEach(id => {
    if (picked.indexOf(id) < 0 || !p.naesin) return;
    const dropProv = id === 'naesin:prov';
    Object.keys(p.naesin.students).forEach(n => {
      const subj = p.naesin.students[n];
      Object.keys(subj).forEach(k => { if (!!(subj[k] && subj[k].isIlam) === dropProv) delete subj[k]; });
      if (!Object.keys(subj).length) delete p.naesin.students[n];
    });
    if (dropProv) p.naesin.ilamData = null;
    p.naesin.fileType = dropProv ? 'neis' : 'ilam';
    p.naesin.fileName = dropProv ? String(p.naesin.fileName || '').split(' + ')[0] : String(p.naesin.fileName || '').split(' + ').slice(1).join(' + ');
    if (!Object.keys(p.naesin.students).length) p.naesin = null;
  });
  if (p.mock && p.mock.students) {
    picked.filter(id => id.indexOf('exam:') === 0).map(id => id.slice(5)).forEach(k => {
      Object.values(p.mock.students).forEach(s => { if (s.exams) delete s.exams[k]; });
    });
    Object.keys(p.mock.students).forEach(n => {
      const s = p.mock.students[n];
      if (!s.exams || !Object.keys(s.exams).length) delete p.mock.students[n];
    });
    if (!Object.keys(p.mock.students).length) p.mock = null;
  }

  // 2) 화면 비우기 (확인창 없이) → 3) 남은 저장분으로 다시 짜기
  mkResetQuiet = true;
  try { resetAll(true); } finally { mkResetQuiet = false; }
  if (typeof stuNos !== 'undefined') stuNos = {};
  if (typeof nsAchOnly !== 'undefined') nsAchOnly = {};
  lastSheetRows = {};   // 번호는 시트를 다시 훑지 말고 저장분(naesin.nums)에서 되살린다
  mkStoreDelOpen = false;

  if (!p.naesin && !p.mock) {
    mkStoreClear(true);
  } else {
    p.savedAt = new Date().toISOString();
    try { localStorage.setItem(MK_STORE_KEY, JSON.stringify(p)); } catch (e) { console.warn('[저장] 골라 지우기 실패', e); }
    mkStoreLoad(false);
  }
  mkStoreRender();
  uiRefresh();
  showToast(names.length + '개 자료를 지웠습니다.');
}

// ═══════════════════════════════════════════════
// 표시
// ═══════════════════════════════════════════════
function mkStoreRender() {
  const box = document.getElementById('mk-store-box');
  if (!box) return;
  const info = mkStoreInfo();

  if (!info.ok) {
    if (info.reason === 'unavailable') {
      box.innerHTML = '<div class="mk-store-off">' + ic('alert', 13) + ' 이 브라우저에서는 로컬 저장을 쓸 수 없습니다 ' +
        '<span style="font-weight:600">(사생활 보호 모드이거나 저장이 차단된 상태)</span>. ' +
        '창을 닫으면 올린 성적이 사라집니다.</div>';
    } else {
      box.innerHTML = '<div class="mk-store-empty">' + ic('save', 13) + ' 아직 저장된 성적이 없습니다. ' +
        '파일을 올리면 이 브라우저에 <b>자동으로 저장</b>되어 다음에 열 때 그대로 나옵니다.</div>';
    }
    return;
  }

  const parts = [];
  if (info.naesin) parts.push(ic('file', 12) + ' 내신 <b>' + info.naesin + '명</b>');
  if (info.mock) parts.push(ic('trend', 12) + ' 모의 <b>' + info.mock + '명</b> · ' + info.exams + '회차');

  box.innerHTML =
    '<div class="mk-store-on">' +
    '<div class="mk-store-head">' + ic('check', 13) + '<span>저장됨</span>' +
    '<span class="mk-store-time">' + (info.savedAt ? info.savedAt.slice(0, 16).replace('T', ' ') : '') + '</span></div>' +
    '<div class="mk-store-body">' + parts.join(' &nbsp;·&nbsp; ') +
    ' <span style="color:var(--ink-3);font-weight:600">(' + mkBytes(info.bytes) + ')</span></div>' +
    '<div class="mk-store-acts">' +
    '<button onclick="mkStoreLoad(true)">' + ic('refresh', 13) + ' 다시 불러오기</button>' +
    '<button class="danger" onclick="mkStoreDelToggle(true)">' + ic('trash', 13) + ' 저장분 삭제</button>' +
    '</div>' + (mkStoreDelOpen ? mkStoreDelHtml() : '') + '</div>';
}

/** 데이터가 바뀔 때마다 호출 (자동 저장) */
function mkStoreTouch() {
  mkStoreSave(true);
}

/* ══════════════ 내신/subject-table.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   과목 → 과목군 표 (subject-table.js) — 2022 개정 교육과정
   ───────────────────────────────────────────────────────────────
   과목명 글자만 보고 분류하면 '경제 수학'이 사회로, '영미 문학 읽기'가 국어로,
   '중국어'가 국어('국어'를 품고 있다)로, '기후변화와 지속가능한 세계'가 과학으로 넘어간다.
   그래서 교육과정에 있는 과목은 이 표로 먼저 정하고, 표에 없는 과목만
   기존 글자 분류(classifySubject의 CATEGORY_MAP)에 맡긴다.

   2022 개정 과목만 둔다. 2015 개정은 지금 고3뿐이라 상담 분석에서 빠졌다(사용자 결정, 2026-10).

   출처: 부산광역시교육청 고교학점제지원센터 「과목 소개 - 2022개정 교육과정」
         https://home.pen.go.kr/hscredit/cm/cntnts/cntntsView.do?cntntsId=3729&mi=17411

   과목군 이름은 본문 CATEGORY_MAP과 같다:
     국어계열 · 수학계열 · 영어계열 · 사회계열 · 과학계열 · 제2외국어 · 예체능·기타
   (한문은 나이스 교과가 '제2외국어/한문'이라 제2외국어에 둔다. 체육·예술·기술·가정/정보·교양은 예체능·기타)
   ═══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const KO = '국어계열', MA = '수학계열', EN = '영어계열', SO = '사회계열', SC = '과학계열', FL = '제2외국어', ET = '예체능·기타';

  const LIST = {};
  const add = (cat, names) => names.forEach(n => { LIST[norm(n)] = cat; });

  // 국어 — 공통 / 일반 / 진로 / 융합
  add(KO, ['공통국어1', '공통국어2',
    '화법과 언어', '독서와 작문', '문학',
    '주제 탐구 독서', '문학과 영상', '직무 의사소통',
    '독서 토론과 글쓰기', '매체 의사소통', '언어생활 탐구']);

  // 수학
  add(MA, ['공통수학1', '공통수학2', '기본수학1', '기본수학2',
    '대수', '미적분Ⅰ', '확률과 통계',
    '기하', '미적분Ⅱ', '경제 수학', '인공지능 수학', '직무 수학',
    '수학과 문화', '실용 통계', '수학과제 탐구']);

  // 영어
  add(EN, ['공통영어1', '공통영어2', '기본영어1', '기본영어2',
    '영어Ⅰ', '영어Ⅱ', '영어 독해와 작문',
    '영미 문학 읽기', '영어 발표와 토론', '심화 영어', '심화 영어 독해와 작문', '직무 영어',
    '실생활 영어 회화', '미디어 영어', '세계 문화와 영어']);

  // 사회(역사/도덕 포함)
  add(SO, ['통합사회1', '통합사회2', '한국사1', '한국사2',
    '세계시민과 지리', '세계사', '사회와 문화', '현대사회와 윤리',
    '한국지리 탐구', '도시의 미래 탐구', '동아시아 역사 기행', '정치', '법과 사회', '경제',
    '윤리와 사상', '인문학과 윤리', '국제 관계의 이해',
    '여행지리', '역사로 탐구하는 현대 세계', '사회문제 탐구', '금융과 경제생활', '윤리문제 탐구',
    '기후변화와 지속가능한 세계']);

  // 과학
  add(SC, ['통합과학1', '통합과학2', '과학탐구실험1', '과학탐구실험2',
    '물리학', '화학', '생명과학', '지구과학',
    '역학과 에너지', '전자기와 양자', '물질과 에너지', '화학 반응의 세계',
    '세포와 물질대사', '생물의 유전', '지구시스템과학', '행성우주과학',
    '과학의 역사와 문화', '기후변화와 환경생태', '융합과학 탐구']);

  // 제2외국어 — 일반: ○○어 / 진로: ○○어 회화, 심화 ○○어 / 융합: ○○어권 문화
  ['독일어', '프랑스어', '스페인어', '중국어', '일본어', '러시아어', '아랍어', '베트남어'].forEach(l => {
    add(FL, [l, l + ' 회화', '심화 ' + l, l + '권 문화']);
  });
  // 한문
  add(FL, ['한문', '한문 고전 읽기', '언어생활과 한자']);

  // 체육 · 예술 · 기술·가정/정보 · 교양
  add(ET, [
    '체육1', '체육2', '운동과 건강', '스포츠 문화', '스포츠 과학', '스포츠 생활1',
    '음악', '미술', '연극', '음악 연주와 창작', '음악 감상과 비평', '미술 창작', '미술 감상과 비평', '음악과 미디어', '미술과 매체',
    '기술·가정', '로봇과 공학세계', '생활과학 탐구', '창의 공학 설계', '지식 재산 일반', '생애 설계와 자립', '아동발달과 부모',
    '정보', '인공지능 기초', '데이터 과학', '소프트웨어와 생활',
    '진로와 직업', '생태와 환경', '인간과 철학', '논리와 사고', '인간과 심리', '교육의 이해', '삶과 종교', '보건',
    '인간과 경제활동', '논술'
  ]);

  /** 띄어쓰기·가운뎃점 차이와 로마숫자 표기(Ⅰ / I) 차이를 없앤다 */
  function norm(s) {
    return String(s || '')
      .replace(/[\s·・‧ㆍ∙]/g, '')
      .replace(/III$/, 'Ⅲ').replace(/II$/, 'Ⅱ').replace(/I$/, 'Ⅰ');   // 소문자로 바꾸면 Ⅰ이 ⅰ가 되므로 바꾸지 않는다
  }

  /** 표에 있으면 과목군, 없으면 null. 끝 번호만 다른 경우(스포츠 생활2)도 잡는다. */
  function lookup(subject) {
    const n = norm(subject);
    if (!n) return null;
    if (LIST[n]) return LIST[n];
    const base = n.replace(/[\dⅠⅡⅢⅣⅤ]+$/, '');
    if (base && LIST[base]) return LIST[base];
    return null;
  }

  const api = { lookup: lookup, norm: norm, LIST: LIST, CATS: [KO, MA, EN, SO, SC, FL, ET] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SubjectTable = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* ══════════════ 내신/naesin-engine.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   내신 계산 엔진 (naesin-engine.js)
   ───────────────────────────────────────────────────────────────
   순수 함수만. DOM을 모른다. Node에서 바로 검증할 수 있다.

   성적 항목(entry)은 본문 파서가 만든 것을 그대로 받는다.
     { subject, term:'2학년 1학기', grade, unit?, area?, score?, avg?, stddev? ... }
     unit — 학점(단위수). 교과학습발달상황은 '학점수'·'학점' 열, 일람표는 과목명 괄호 「문학(3)」.
     area — 나이스 '교과' 열 값(국어·수학·사회(역사/도덕포함) …). 없으면 과목명으로 분류한다.

   평균은 대학 산출 방식대로 학점 가중이다: Σ(등급×학점) / Σ학점.
   항목 중 하나라도 학점이 없으면 섞어 계산하지 않고 단순 평균으로 내려간다
   (학점 4와 '없음→1'을 섞으면 어느 쪽도 아닌 숫자가 나온다).
   ═══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const TERMS = ['1학년 1학기', '1학년 2학기', '2학년 1학기', '2학년 2학기', '3학년 1학기', '3학년 2학기'];
  const AREAS = ['국', '수', '영', '사', '과', '기타'];
  const AREA_NAME = { 국: '국어', 수: '수학', 영: '영어', 사: '사회', 과: '과학', 기타: '기타' };
  const COMBOS = [
    { id: 'all', label: '전과목', areas: null },
    { id: 'kem', label: '국영수', areas: ['국', '수', '영'] },
    { id: 'kems', label: '국영수사', areas: ['국', '수', '영', '사'] },
    { id: 'kemc', label: '국영수과', areas: ['국', '수', '영', '과'] }
  ];
  /** 수시 반영은 3학년 1학기까지가 보통이다 */
  const SUSI_LAST = '3학년 1학기';

  const termIdx = t => TERMS.indexOf(t);
  const okGrade = d => !!d && typeof d.grade === 'number' && isFinite(d.grade) && d.grade >= 1 && d.grade <= 9;
  const r2 = v => Math.round(v * 100) / 100;

  // ═══════════════════════════════════════════════
  // 교과 분류
  // ═══════════════════════════════════════════════
  const CAT_TO_AREA = { 국어계열: '국', 수학계열: '수', 영어계열: '영', 사회계열: '사', 과학계열: '과' };

  /** 국·수·영·사·과·기타. 나이스 '교과' 열이 있으면 그것을 믿고, 없으면 과목명 분류기에 맡긴다. */
  function areaOf(d, classify) {
    if (d._area) return d._area;
    const a = String(d.area || '').replace(/\s/g, '');
    if (a) {
      if (a.indexOf('국어') === 0) return '국';
      if (a.indexOf('수학') === 0) return '수';
      if (a.indexOf('영어') === 0) return '영';
      if (a.indexOf('한국사') === 0 || a.indexOf('사회') === 0) return '사';
      if (a.indexOf('과학') === 0) return '과';
      return '기타';
    }
    if (typeof classify === 'function') return CAT_TO_AREA[classify(d.subject || '')] || '기타';
    return '기타';
  }

  function inCombo(d, combo, classify) {
    if (!combo || !combo.areas) return true;
    return combo.areas.indexOf(areaOf(d, classify)) >= 0;
  }
  function comboById(id) { return COMBOS.filter(c => c.id === id)[0] || COMBOS[0]; }

  // ═══════════════════════════════════════════════
  // 평균
  // ═══════════════════════════════════════════════
  const hasUnit = d => typeof d.unit === 'number' && d.unit > 0;

  /** { avg, n, units, weighted, sum, w }  — sum·w는 시뮬레이션에서 이어 붙이려고 남긴다 */
  function avgInfo(list) {
    const xs = (list || []).filter(okGrade);
    if (!xs.length) return { avg: null, n: 0, units: 0, weighted: false, sum: 0, w: 0 };
    const weighted = xs.every(hasUnit);
    let sum = 0, w = 0;
    xs.forEach(d => { const k = weighted ? d.unit : 1; sum += d.grade * k; w += k; });
    return { avg: sum / w, n: xs.length, units: weighted ? w : 0, weighted: weighted, sum: sum, w: w };
  }

  function comboAvgs(entries, classify) {
    const out = {};
    COMBOS.forEach(c => { out[c.id] = avgInfo(entries.filter(d => inCombo(d, c, classify))); });
    return out;
  }

  function presentTerms(entries) {
    const set = new Set(entries.filter(okGrade).map(d => d.term));
    return TERMS.filter(t => set.has(t));
  }

  /** 학기별 조합 평균. cum은 그 학기까지의 누적 평균(대학에 들어가는 숫자에 가깝다). */
  function termSeries(entries, classify) {
    const terms = presentTerms(entries);
    const byCombo = {};
    COMBOS.forEach(c => {
      const mine = entries.filter(d => okGrade(d) && inCombo(d, c, classify));
      byCombo[c.id] = terms.map(t => {
        const a = avgInfo(mine.filter(d => d.term === t));
        const cu = avgInfo(mine.filter(d => termIdx(d.term) <= termIdx(t)));
        return { term: t, avg: a.avg === null ? null : r2(a.avg), cum: cu.avg === null ? null : r2(cu.avg), n: a.n };
      });
    });
    return { terms: terms, byCombo: byCombo };
  }

  /** 첫 학기 대비 마지막 학기 변화 (음수 = 등급이 좋아짐) */
  function seriesChange(list) {
    const xs = (list || []).filter(p => p.avg !== null);
    if (xs.length < 2) return null;
    return { from: xs[0], to: xs[xs.length - 1], delta: r2(xs[xs.length - 1].avg - xs[0].avg) };
  }

  // ═══════════════════════════════════════════════
  // 목표 시뮬레이션
  // ═══════════════════════════════════════════════
  function futureTerms(lastTerm, until) {
    const a = termIdx(lastTerm), b = termIdx(until || SUSI_LAST);
    if (a < 0 || b < 0 || b <= a) return [];
    return TERMS.slice(a + 1, b + 1);
  }

  /**
   * 남은 학기를 직전 학기와 같은 과목·학점으로 듣는다고 가정하고,
   * 교과별 목표 등급을 넣어 최종 평균을 예상한다.
   * opt = { targets: {국:2, 수:3, ...}, until: '3학년 1학기' }
   */
  function simulate(entries, classify, opt) {
    opt = opt || {};
    const xs = entries.filter(okGrade);
    const terms = presentTerms(xs);
    const last = terms[terms.length - 1] || null;
    const future = last ? futureTerms(last, opt.until) : [];
    const lastEntries = last ? xs.filter(d => d.term === last) : [];
    const weighted = xs.length > 0 && xs.every(hasUnit);

    // 직전 학기 구성 = 앞으로의 한 학기 틀
    const template = lastEntries.map(d => ({
      subject: d.subject, area: areaOf(d, classify), unit: weighted ? d.unit : 1, grade: d.grade
    }));
    // 교과별 직전 학기 평균. 고르는 칸에는 반올림 값을 보여 준다.
    const defaults = {}, lastAvg = {};
    AREAS.forEach(a => {
      const inA = lastEntries.filter(d => areaOf(d, classify) === a);
      if (inA.length) { lastAvg[a] = r2(avgInfo(inA).avg); defaults[a] = Math.round(lastAvg[a]); }
    });
    // 손대지 않은 교과는 직전 학기 과목별 등급을 그대로 되풀이한다.
    // (교과 평균 3.5를 4로 반올림해 넣으면 아무것도 안 바꿨는데 예상이 나빠진다)
    const set = {};
    Object.keys(opt.targets || {}).forEach(a => { if (typeof opt.targets[a] === 'number' && isFinite(opt.targets[a])) set[a] = opt.targets[a]; });
    const targets = Object.assign({}, defaults, set);

    const synth = [];
    future.forEach(t => template.forEach(s => {
      const g = (s.area in set) ? set[s.area] : s.grade;
      synth.push({ subject: s.subject, term: t, grade: g, unit: weighted ? s.unit : undefined, _area: s.area });
    }));

    const byCombo = {};
    COMBOS.forEach(c => {
      const curL = xs.filter(d => inCombo(d, c, classify));
      const addL = synth.filter(d => inCombo(d, c, classify));
      const cur = avgInfo(curL);
      const proj = avgInfo(curL.concat(addL));
      let addW = 0;
      addL.forEach(d => { addW += weighted ? d.unit : 1; });
      byCombo[c.id] = {
        cur: cur.avg === null ? null : r2(cur.avg),
        proj: proj.avg === null ? null : r2(proj.avg),
        sumCur: cur.sum, wCur: cur.w, wAdd: addW
      };
    });

    return {
      last: last, future: future, template: template, defaults: defaults, lastAvg: lastAvg,
      targets: targets, changed: set,
      areas: AREAS.filter(a => template.some(s => s.area === a)),
      weighted: weighted, byCombo: byCombo
    };
  }

  /**
   * 최종 목표 평균 goal을 만들려면 남은 학기에 그 조합에서 평균 몇 등급이 필요한가.
   * { need, status }  status: 'done'(이미 달성·유지만) | 'ok' | 'impossible' | 'none'(남은 학기 없음)
   */
  function neededAvg(sim, comboId, goal, gradeMax) {
    const b = sim && sim.byCombo[comboId];
    if (!b || !b.wCur || !(goal > 0)) return { need: null, status: 'none' };
    if (!b.wAdd) return { need: null, status: 'none' };
    const need = (goal * (b.wCur + b.wAdd) - b.sumCur) / b.wAdd;
    const best = (b.sumCur + 1 * b.wAdd) / (b.wCur + b.wAdd);
    if (need < 1) return { need: r2(need), status: 'impossible', best: r2(best) };
    if (need >= (gradeMax || 9)) return { need: r2(need), status: 'done', best: r2(best) };
    return { need: r2(need), status: 'ok', best: r2(best) };
  }

  // ═══════════════════════════════════════════════
  // 원점수 위치
  // ═══════════════════════════════════════════════
  /** 원점수가 과목평균에서 얼마나 떨어져 있나. stddev가 없는 양식(2022 개정)은 z 없이 차이만. */
  function positions(entries, term) {
    return entries
      .filter(d => d.term === term && typeof d.score === 'number' && isFinite(d.score) &&
        typeof d.avg === 'number' && isFinite(d.avg))
      .map(d => {
        const sd = (typeof d.stddev === 'number' && d.stddev > 0) ? d.stddev : null;
        return {
          subject: d.subject, grade: d.grade, unit: d.unit || null,
          score: d.score, avg: d.avg, sd: sd,
          diff: r2(d.score - d.avg),
          z: sd ? r2((d.score - d.avg) / sd) : null
        };
      });
  }
  function positionTerms(entries) {
    const set = new Set(entries.filter(d => typeof d.score === 'number' && typeof d.avg === 'number').map(d => d.term));
    return TERMS.filter(t => set.has(t));
  }

  // ═══════════════════════════════════════════════
  // 학급
  // ═══════════════════════════════════════════════
  /**
   * allStudents 전체로 학급 통계를 낸다. 학생마다 전 과목(선택 여부와 무관).
   * rows는 전과목 평균이 좋은 순. lastTerm은 가장 많은 학생이 가진 마지막 학기.
   */
  function classSummary(all, classify) {
    const rows = [];
    const lastCount = {};
    Object.keys(all || {}).forEach(name => {
      const xs = Object.values(all[name] || {}).filter(okGrade);
      if (!xs.length) return;
      const terms = presentTerms(xs);
      const lt = terms[terms.length - 1], pt = terms.length > 1 ? terms[terms.length - 2] : null;
      lastCount[lt] = (lastCount[lt] || 0) + 1;
      const all1 = avgInfo(xs), kem = avgInfo(xs.filter(d => inCombo(d, COMBOS[1], classify)));
      const la = avgInfo(xs.filter(d => d.term === lt)), pa = pt ? avgInfo(xs.filter(d => d.term === pt)) : null;
      rows.push({
        name: name, all: r2(all1.avg), kem: kem.avg === null ? null : r2(kem.avg),
        lastTerm: lt, prevTerm: pt, last: r2(la.avg), prev: pa && pa.avg !== null ? r2(pa.avg) : null,
        delta: pa && pa.avg !== null ? r2(la.avg - pa.avg) : null,
        weighted: all1.weighted
      });
    });
    rows.sort((a, b) => a.all - b.all || a.name.localeCompare(b.name, 'ko'));
    rows.forEach((r, i) => { r.rank = (i > 0 && rows[i - 1].all === r.all) ? rows[i - 1].rank : i + 1; });

    const lastTerm = Object.keys(lastCount).sort((a, b) => lastCount[b] - lastCount[a] || termIdx(b) - termIdx(a))[0] || null;
    const mean = key => { const v = rows.map(r => r[key]).filter(x => x !== null); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; };

    // 과목별 학급 평균 (마지막 학기)
    const bySubj = {};
    if (lastTerm) {
      Object.keys(all).forEach(name => {
        Object.values(all[name] || {}).forEach(d => {
          if (!okGrade(d) || d.term !== lastTerm) return;
          const b = bySubj[d.subject] || (bySubj[d.subject] = { subject: d.subject, area: areaOf(d, classify), sum: 0, n: 0 });
          b.sum += d.grade; b.n++;
        });
      });
    }
    const subjects = Object.values(bySubj)
      .map(b => ({ subject: b.subject, area: b.area, mean: r2(b.sum / b.n), n: b.n }))
      .sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || a.subject.localeCompare(b.subject, 'ko'));

    return { rows: rows, n: rows.length, meanAll: mean('all'), meanKem: mean('kem'), lastTerm: lastTerm, subjects: subjects };
  }

  /** 전과목 평균 분포 (0.5등급 칸) */
  function histogram(rows, gradeMax) {
    const max = gradeMax || 9;
    const bins = [];
    for (let lo = 1; lo < max; lo += 0.5) bins.push({ lo: lo, hi: lo + 0.5, n: 0, names: [] });
    rows.forEach(r => {
      if (r.all === null) return;
      let i = Math.floor((r.all - 1) / 0.5);
      if (i < 0) i = 0;
      if (i >= bins.length) i = bins.length - 1;
      bins[i].n++; bins[i].names.push(r.name);
    });
    return bins;
  }

  /** 직전 학기 대비 학기 평균이 th 이상 움직인 학생 (같은 두 학기를 가진 학생만 비교) */
  function movers(rows, th) {
    const t = th || 0.5;
    const xs = rows.filter(r => r.delta !== null);
    return {
      up: xs.filter(r => r.delta <= -t).sort((a, b) => a.delta - b.delta),
      down: xs.filter(r => r.delta >= t).sort((a, b) => b.delta - a.delta),
      compared: xs.length
    };
  }

  const api = {
    TERMS, AREAS, AREA_NAME, COMBOS, SUSI_LAST,
    okGrade, areaOf, inCombo, comboById,
    avgInfo, comboAvgs, presentTerms, termSeries, seriesChange,
    futureTerms, simulate, neededAvg,
    positions, positionTerms,
    classSummary, histogram, movers
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NaesinEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* ══════════════ 내신/naesin-ui.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   내신 분석 확장 화면 (naesin-ui.js)
   ───────────────────────────────────────────────────────────────
   내신 탭에 카드 네 장과 요약 줄을 붙인다. 계산은 naesin-engine.js.

     요약 카드 아래   반영 조합별 평균 (전과목 · 국영수 · 국영수사 · 국영수과)
     ns-combo-card   반영 조합별 평균 추이 (학기별 / 누적)
     ns-pos-card     원점수 위치 (과목평균 ± 표준편차)
     ns-sim-card     목표 시뮬레이션
     ns-class-card   학급 한눈에 보기 — 다른 학생 이름이 나오므로 인쇄하지 않는다

   기존 코드에서 빌려 쓰는 것:
     allStudents · currentStudent · checkedSubjects · currentSchoolLevel · gradeSystemMax
     classifySubject · Chart · ic · mkCss · mkEsc · mkFix · showToast
   ═══════════════════════════════════════════════════════════════ */

const NE = window.NaesinEngine;

let nsAchOnly = {};            // 이름 → [성취도만 있어 등급 평균에서 뺀 과목]
let nsCharts = {};
let nsComboMode = 'term';      // 'term' | 'cum'
let nsPosTerm = null;
let nsSim = { name: null, targets: {}, until: NE.SUSI_LAST, goal: '', goalCombo: 'all' };
let nsMoverTh = 0.5;

// ═══════════════════════════════════════════════
// 공통
// ═══════════════════════════════════════════════
function nsHigh() { return currentSchoolLevel !== 'middle'; }

/** 그 학생의 성적 항목. 지금 학생이면 선택한 과목만. */
function nsEntries(name, all) {
  const xs = Object.values((allStudents || {})[name] || {});
  if (all || name !== currentStudent || !checkedSubjects || !checkedSubjects.size) return xs;
  return xs.filter(d => checkedSubjects.has(d.subject));
}

/** 본문 코드가 평균을 낼 때 부르는 자리 — 학점 가중 */
function nsAvgInfo(list) { return NE.avgInfo(list || []); }
function nsAvgStr(list) { const a = NE.avgInfo(list || []); return a.avg === null ? '-' : a.avg.toFixed(2); }
function nsAvgTag(list) { return NE.avgInfo(list || []).weighted ? ' (학점 가중)' : ''; }

function nsGradeMax() { return gradeSystemMax || 9; }
function nsG(v) { return (v === null || v === undefined || !isFinite(v)) ? '-' : v.toFixed(2); }
function nsBadge(v) {
  if (v === null || v === undefined || !isFinite(v)) return '<span style="color:var(--ink-3)">-</span>';
  const g = Math.min(9, Math.max(1, Math.round(v)));
  return '<span class="grade-badge g' + g + '">' + v.toFixed(2) + '</span>';
}
/** 등급 차이 — 음수가 좋아진 것 */
function nsDelta(d) {
  if (d === null || d === undefined || !isFinite(d) || d === 0) return '<span class="ns-dl same">변화 없음</span>';
  return d < 0
    ? '<span class="ns-dl up">' + ic('arrowUp', 10) + Math.abs(d).toFixed(2) + '</span>'
    : '<span class="ns-dl down">' + ic('arrowDown', 10) + Math.abs(d).toFixed(2) + '</span>';
}
function nsShortTerm(t) { return String(t || '').replace('학년 ', '-').replace('학기', ''); }
function nsDestroy(id) { if (nsCharts[id]) { try { nsCharts[id].destroy(); } catch (e) {} delete nsCharts[id]; } }
function nsComboColor(id) {
  return { all: mkCss('--ink-2'), kem: mkCss('--accent'), kems: mkCss('--good'), kemc: mkCss('--warn') }[id] || mkCss('--ink-3');
}

/** 파서가 따로 떼어 둔 '성취도만 있는 과목'을 받는다 (applyParseResult에서 부른다) */
function nsTakeAchOnly(students) {
  nsAchOnly = (students && students.__achOnly) || {};
}

// ═══════════════════════════════════════════════
// 진입점
// ═══════════════════════════════════════════════
function nsBuildAll() {
  const ids = ['ns-combo-card', 'ns-pos-card', 'ns-sim-card', 'ns-class-card'];
  const on = nsHigh() && !!(allStudents || {})[currentStudent];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; });
  if (!on) return;
  [nsBuildCombo, nsBuildPositions, nsRenderSim, nsBuildClass].forEach(f => {
    try { f(); } catch (e) { console.error('[내신 확장] ' + f.name, e); }
  });
}

// ═══════════════════════════════════════════════
// ① 요약 카드 — 반영 조합별 평균
// ═══════════════════════════════════════════════
function nsSummaryExtra() {
  if (!nsHigh()) return;
  const box = document.getElementById('summary-content');
  const xs = nsEntries(currentStudent);
  if (!box || !xs.length) return;

  const ca = NE.comboAvgs(xs, classifySubject);
  const tiles = NE.COMBOS.map(c => {
    const a = ca[c.id];
    const sub = a.avg === null ? '해당 과목 없음' : (a.weighted ? a.units + '학점 · ' : '') + a.n + '과목';
    return '<div class="mk-tile"><div class="t">' + c.label + '</div>' +
      '<div class="v" style="color:' + (c.id === 'all' ? 'var(--ink)' : nsComboColor(c.id)) + '">' + nsG(a.avg) + '</div>' +
      '<div class="s">' + sub + '</div></div>';
  }).join('');

  const all = ca.all;
  let note = all.weighted
    ? '<b>학점 가중 평균</b>입니다 (등급×학점의 합 ÷ 학점 합, 대학 산출 방식). 이수 학점 합 <b>' + all.units + '학점</b>.'
    : '이 자료에는 <b>학점 정보가 없어 단순 평균</b>입니다. 나이스 파일을 다시 올리면 학점 가중으로 계산합니다.';
  const pv = [...nsProvTermsOf(currentStudent)];
  if (pv.length) note += '<br><b>' + pv.join(', ') + '</b>는 1차 고사 전과목 성적 일람표의 석차로 낸 <b>예상 등급</b>입니다. 평균에 함께 들어가 있습니다.';
  const ao = nsAchOnly[currentStudent] || [];
  if (ao.length) {
    const names = [...new Set(ao.map(d => d.subject))];
    note += '<br>석차등급 없이 성취도만 있는 과목 ' + ao.length + '개(' + mkEsc(names.slice(0, 5).join(', ')) +
      (names.length > 5 ? ' 외' : '') + ')는 등급 평균에서 뺐습니다.';
  }

  box.innerHTML +=
    '<div class="ns-sum-h">반영 조합별 평균</div>' +
    '<div class="mk-kpi ns-kpi">' + tiles + '</div>' +
    '<div class="ns-sum-note">' + note + '</div>';
}

// ═══════════════════════════════════════════════
// ② 반영 조합별 평균 추이
// ═══════════════════════════════════════════════
function nsSetComboMode(m) { nsComboMode = m; nsBuildCombo(); }

/** 조합 평균 표 — 화면과 일괄 인쇄가 같이 쓴다 */
function nsComboTableHtml(ts, key) {
  const provSet = nsProvTermsOf(currentStudent);
  const th = '<th style="text-align:left">조합</th>' + ts.terms.map(t => '<th>' + nsShortTerm(t) +
    (provSet.has(t) ? '<br><span class="ns-prov">예상</span>' : '') + '</th>').join('') + '<th>첫 학기 대비</th>';
  const rows = NE.COMBOS.map(c => {
    const list = ts.byCombo[c.id];
    const vals = list.map(p => p[key]);
    if (vals.every(v => v === null)) return '';
    const ch = NE.seriesChange(list.map(p => ({ term: p.term, avg: p[key] })));
    return '<tr><td style="text-align:left;white-space:nowrap"><span class="ns-swatch" style="background:' + nsComboColor(c.id) + '"></span><b style="color:var(--ink)">' + c.label + '</b></td>' +
      vals.map(v => '<td>' + nsBadge(v) + '</td>').join('') +
      '<td>' + (ch ? nsDelta(ch.delta) : '<span style="color:var(--ink-3)">-</span>') + '</td></tr>';
  }).join('');
  return '<div class="tbl-wrap"><table class="mk-table ns-combo-tbl"><thead><tr>' + th + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/** 조합 추이 차트 설정 — 화면 캔버스와 일괄 인쇄 PNG가 같은 설정을 쓴다. 그릴 게 없으면 null */
function nsComboConfig(ts, key, forPrint) {
  if (ts.terms.length < 2) return null;
  const gm = nsGradeMax();
  // 1차 고사 일람표로 낸 예상 학기 — 그 학기로 들어가는 선은 점선, 점은 속이 빈 동그라미
  const provSet = nsProvTermsOf(currentStudent);
  const prov = ts.terms.map(t => provSet.has(t));
  const datasets = NE.COMBOS.map(c => {
    const pts = ts.byCombo[c.id].map(p => p[key]);
    if (pts.every(v => v === null)) return null;
    const col = nsComboColor(c.id);
    return {
      label: c.label, data: pts, borderColor: col, backgroundColor: col,
      borderWidth: c.id === 'all' ? 3 : 2, segment: nsProvSegment(prov),
      pointBackgroundColor: nsProvPointFill(prov, col), pointBorderWidth: 2,
      pointRadius: 4, pointHoverRadius: 6, tension: 0.2, spanGaps: true
    };
  }).filter(Boolean);
  // 조합 평균은 서로 가깝게 붙어 있다. 1~9 전체로 그리면 선이 평평해 보이므로 이 학생 범위로 좁힌다.
  const all = datasets.flatMap(d => d.data).filter(v => v !== null);
  if (!all.length) return null;
  const yMin = Math.max(1, Math.floor(Math.min.apply(null, all) * 2) / 2 - 0.5);
  const yMax = Math.min(gm, Math.ceil(Math.max.apply(null, all) * 2) / 2 + 0.5);
  const fs = forPrint ? 13 : 11;
  return {
    type: 'line',
    data: { labels: nsProvLabels(ts.terms, provSet), datasets: datasets },
    options: {
      responsive: !forPrint, maintainAspectRatio: false, animation: forPrint ? false : undefined,
      scales: {
        y: {
          reverse: true, min: yMin, max: yMax,
          ticks: { stepSize: 0.5, callback: v => (v * 2 === Math.round(v * 2)) ? v.toFixed(1) + '등급' : '', font: { size: fs } },
          grid: { color: 'rgba(0,0,0,.06)' }
        },
        x: { ticks: { font: { size: fs - 1 } } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: fs }, padding: 14, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (c.parsed.y === null ? '-' : c.parsed.y.toFixed(2) + '등급') } }
      }
    }
  };
}

function nsBuildCombo() {
  const xs = nsEntries(currentStudent);
  const ts = NE.termSeries(xs, classifySubject);
  const modeBox = document.getElementById('ns-combo-mode');
  const tblBox = document.getElementById('ns-combo-table');
  const wrap = document.getElementById('ns-combo-chartwrap');
  if (!modeBox || !tblBox) return;
  const key = nsComboMode === 'cum' ? 'cum' : 'avg';

  modeBox.innerHTML =
    '<button class="pickchip' + (key === 'avg' ? ' on' : '') + '" onclick="nsSetComboMode(\'term\')">학기별 평균</button>' +
    '<button class="pickchip' + (key === 'cum' ? ' on' : '') + '" onclick="nsSetComboMode(\'cum\')">그 학기까지 누적</button>';

  tblBox.innerHTML = nsComboTableHtml(ts, key) +
    (key === 'cum' ? '<div class="ns-foot">누적은 1학년 1학기부터 그 학기까지 모든 과목을 학점으로 가중한 평균입니다. 수시에 반영되는 숫자에 가깝습니다.</div>'
      : '<div class="ns-foot">학기별은 그 학기 과목만의 평균입니다. 오르내림을 보기에 좋습니다.</div>');

  nsDestroy('combo');
  const cfg = nsComboConfig(ts, key, false);
  if (!cfg) {
    wrap.style.display = 'none';
    tblBox.innerHTML = '<div class="note plain">학기가 하나뿐이라 추이 그래프는 생략합니다. 여러 학기가 담긴 교과학습발달상황 파일을 올리면 그래프가 나옵니다.</div>' + tblBox.innerHTML;
    return;
  }
  wrap.style.display = '';
  const cv = document.getElementById('ns-combo-chart');
  if (!cv || typeof Chart === 'undefined') return;
  nsCharts.combo = new Chart(cv.getContext('2d'), cfg);
}

// ═══════════════════════════════════════════════
// ③ 원점수 위치
// ═══════════════════════════════════════════════
function nsSetPosTerm(t) { nsPosTerm = t; nsBuildPositions(); }

/** 원점수 위치 막대들 — 화면과 일괄 인쇄가 같이 쓴다 */
function nsPosHtml(xs, term) {
  const list = NE.positions(xs, term);
  const hasSd = list.some(p => p.sd);
  const pc = v => Math.max(0, Math.min(100, v));
  const rows = list.map(p => {
    const band = p.sd ? '<span class="ns-band" style="left:' + pc(p.avg - p.sd) + '%;width:' + (pc(p.avg + p.sd) - pc(p.avg - p.sd)) + '%"></span>' : '';
    const tone = p.z !== null ? (p.z >= 1 ? 'hi' : (p.z <= -1 ? 'lo' : 'mid')) : (p.diff >= 10 ? 'hi' : (p.diff <= -10 ? 'lo' : 'mid'));
    const where = p.z !== null
      ? (p.z >= 0 ? '평균보다 표준편차의 <b>' + p.z.toFixed(1) + '배</b> 위' : '평균보다 표준편차의 <b>' + Math.abs(p.z).toFixed(1) + '배</b> 아래')
      : (p.diff >= 0 ? '평균보다 <b>' + p.diff.toFixed(1) + '점</b> 높음' : '평균보다 <b>' + Math.abs(p.diff).toFixed(1) + '점</b> 낮음');
    return '<div class="ns-pos-row">' +
      '<div class="ns-pos-nm"><b>' + mkEsc(p.subject) + '</b><span class="grade-badge g' + Math.round(p.grade) + '">' + p.grade + '</span></div>' +
      '<div class="ns-track">' + band +
        '<span class="ns-avg" style="left:' + pc(p.avg) + '%" title="과목평균 ' + p.avg + '"></span>' +
        '<span class="ns-me ' + tone + '" style="left:' + pc(p.score) + '%" title="내 점수 ' + p.score + '"></span></div>' +
      '<div class="ns-pos-tx"><span class="num"><b>' + p.score + '</b> / ' + p.avg + '</span><span class="w ' + tone + '">' + where + '</span></div>' +
      '</div>';
  }).join('');

  return '<div class="ns-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100점</span></div>' +
    rows +
    // 점 색은 평균과의 거리로 정한다 — 범례도 세 가지를 다 보여 줘야 화면과 맞는다
    '<div class="ns-legend"><span class="ns-lg-h">내 원점수</span>' +
    (hasSd
      ? '<span><i class="ns-me hi"></i>평균보다 표준편차 1배 이상 위</span><span><i class="ns-me mid"></i>평균 근처</span><span><i class="ns-me lo"></i>평균보다 표준편차 1배 이상 아래</span>'
      : '<span><i class="ns-me hi"></i>평균보다 10점 이상 높음</span><span><i class="ns-me mid"></i>평균 근처</span><span><i class="ns-me lo"></i>평균보다 10점 이상 낮음</span>') +
    '<span><i class="ns-avg"></i>과목평균</span>' +
    (hasSd ? '<span><i class="ns-band"></i>평균 ± 표준편차 (수강자 약 68%가 이 안)</span>' : '') + '</div>' +
    (hasSd ? '' : '<div class="note plain" style="margin-top:8px">2022 개정 양식은 표준편차가 기록되지 않아 평균과의 점수 차이만 보여 줍니다.</div>');
}

function nsBuildPositions() {
  const card = document.getElementById('ns-pos-card');
  const box = document.getElementById('ns-pos-content');
  const xs = nsEntries(currentStudent);
  const terms = NE.positionTerms(xs);
  if (!terms.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  if (!nsPosTerm || terms.indexOf(nsPosTerm) < 0) nsPosTerm = terms[terms.length - 1];
  const chips = terms.map(t => '<button class="pickchip' + (t === nsPosTerm ? ' on' : '') + '" onclick="nsSetPosTerm(\'' + t + '\')">' + nsShortTerm(t) + '</button>').join('');
  box.innerHTML = '<div class="pickrow">' + chips + '</div>' + nsPosHtml(xs, nsPosTerm);
}

// ═══════════════════════════════════════════════
// 일괄 인쇄 — 학생 블록에 조합 추이 · 원점수 위치를 덧붙인다
// 시뮬레이션은 선생님이 값을 골라야 뜻이 있어서, 학급 카드는 다른 학생이 나와서 넣지 않는다.
// ═══════════════════════════════════════════════
async function nsPrintBlock(name, withChart) {
  if (!nsHigh() || !(allStudents || {})[name]) return '';
  const xs = nsEntries(name);
  const ts = NE.termSeries(xs, classifySubject);
  let html = '';
  if (ts.terms.length) {
    let img = '';
    const cfg = withChart ? nsComboConfig(ts, 'avg', true) : null;
    if (cfg && typeof renderConfigToBase64 === 'function') {
      const b64 = await renderConfigToBase64(1100, 360, cfg);
      if (b64) img = '<img class="bp-chart" src="data:image/png;base64,' + b64 + '" alt="반영 조합별 평균 추이">';
    }
    html += '<div class="ns-bp-combo"><div class="bp-sec">반영 조합별 평균 추이 (학기별 · 학점 가중)</div>' + img + nsComboTableHtml(ts, 'avg') + '</div>';
  }
  const pt = NE.positionTerms(xs);
  if (pt.length) {
    const t = pt[pt.length - 1];
    html += '<div class="bp-sec">원점수 위치 (' + mkEsc(t) + ')</div><div class="ns-bp-pos">' + nsPosHtml(xs, t) + '</div>';
  }
  return html;
}

// ═══════════════════════════════════════════════
// 방사형 — 과목군별(기본) / 과목별
// 원본 radarConfig()는 그대로 두고, 축 목록과 꾸밈만 바꾼다.
// 막대그래프(과목군별 등급)가 값을 보여 주므로, 방사형은 '이 학생 평균보다 강한지 약한지'를 보여 준다.
// ═══════════════════════════════════════════════
let nsRadarMode = 'cat';                // 'cat' | 'subj'
const NS_RADAR_TH = 0.3;                // 평균과 이만큼 차이 나면 강점·약점

function nsSetRadarMode(m) { nsRadarMode = m; buildRadarChart(); }
function nsCatShort(cat) { return String(cat).replace(/계열$/, ''); }

/** 방사형 축. mode를 주면 화면 선택과 상관없이 그 방식으로 (일괄 인쇄는 늘 과목군) */
function nsRadarEntries(data, subjSet, mode) {
  const m = mode || nsRadarMode;
  if (m === 'cat') {
    const list = getCategoryAvgList(data, subjSet);
    if (list.length >= 3) {
      const e = list.map(x => ({ name: nsCatShort(x.cat), cat: x.cat, cnt: x.cnt, subjCnt: x.subjCnt, avg: x.avg }));
      e._mode = 'cat';
      return e;
    }
  }
  const e = getRadarEntries(data, subjSet);
  e._mode = 'subj';
  e._fallback = (m === 'cat');
  return e;
}

function nsRadarTone(entries, ov) {
  return entries.map(e => (ov === null || e.avg === null) ? 'mid'
    : (e.avg - ov <= -NS_RADAR_TH ? 'hi' : (e.avg - ov >= NS_RADAR_TH ? 'lo' : 'mid')));
}

/** radarConfig() 결과에 강점·약점 색과 '내 평균' 점선 원을 입힌다 */
function nsRadarDecorate(cfg, entries) {
  const ov = nsAvgInfo(nsEntries(currentStudent)).avg;
  const ds = cfg.data.datasets[0];
  const tone = nsRadarTone(entries, ov);
  const good = mkCss('--good'), bad = mkCss('--bad');
  // 보통 꼭짓점은 속을 비우고 강점·약점만 칠한다 — 청록 선 위에서 초록 점이 묻히지 않게
  ds.pointBackgroundColor = tone.map(t => t === 'hi' ? good : (t === 'lo' ? bad : '#ffffff'));
  ds.pointBorderColor = tone.map(t => t === 'mid' ? ds.borderColor : '#ffffff');
  ds.pointBorderWidth = tone.map(t => t === 'mid' ? 2 : 1.5);
  ds.pointRadius = tone.map(t => t === 'mid' ? 4 : 7);
  if (ov !== null) {
    cfg.data.datasets.push({
      label: '내 평균', data: entries.map(() => toAxisVal(ov)),
      borderColor: 'rgba(80,90,100,.75)', borderDash: [5, 4], borderWidth: 1.5,
      pointRadius: 0, pointHoverRadius: 0, fill: false, backgroundColor: 'transparent'
    });
  }
  const tt = cfg.options.plugins.tooltip;
  tt.callbacks = {
    label: c => {
      if (c.datasetIndex === 1) return '이 학생 전체 평균 ' + fmtGrade(ov);
      const e = entries[c.dataIndex];
      return c.label + ': ' + fmtGrade(e.avg) + (entries._mode === 'cat' ? ' (과목 ' + e.subjCnt + '개 · 학점 가중)' : ' (' + e.cnt + '개 학기 평균)');
    }
  };
  const tl = cfg.options.plugins.title;
  if (tl && tl.text && entries._mode === 'cat') tl.text = String(tl.text).replace('과목별 방사형', '과목군별 방사형');
  return cfg;
}

/** 강점·약점 문장 (화면 카드와 일괄 인쇄가 같이 쓴다) */
function nsRadarSwHtml(entries, ov) {
  const tone = nsRadarTone(entries, ov);
  const pick = t => entries.map((e, i) => ({ e, t: tone[i] })).filter(x => x.t === t)
    .sort((a, b) => t === 'hi' ? a.e.avg - b.e.avg : b.e.avg - a.e.avg).slice(0, 4)
    .map(x => mkEsc(x.e.name) + ' ' + x.e.avg.toFixed(2)).join(' · ');
  const hi = pick('hi'), lo = pick('lo');
  return '<div class="ns-radar-sw"><span class="hi"><b>강점</b> ' + (hi || '없음') + '</span>' +
    '<span class="lo"><b>약점</b> ' + (lo || '없음') + '</span></div>' +
    '<div class="ns-foot">점선은 이 학생 전체 평균 <b>' + ov.toFixed(2) + '</b>입니다. 평균보다 ' + NS_RADAR_TH + '등급 이상 좋으면 강점, 나쁘면 약점입니다.</div>';
}

/** 일괄 인쇄용 — 과목군 기준 강점·약점 문장 */
function nsRadarPrintNote(name) {
  const data = (allStudents || {})[name];
  if (!data) return '';
  const entries = nsRadarEntries(data, checkedSubjects, 'cat');
  const ov = nsAvgInfo(nsEntries(name)).avg;
  return (ov === null || entries.length < 3) ? '' : nsRadarSwHtml(entries, ov);
}

/** 방사형 카드 위 전환 버튼과 아래 강점·약점 줄 */
function nsRadarHead(entries) {
  const modeBox = document.getElementById('ns-radar-mode');
  const noteBox = document.getElementById('ns-radar-note');
  if (modeBox) {
    const on = entries._mode === 'cat' ? 'cat' : (entries._fallback ? 'cat' : 'subj');
    modeBox.innerHTML =
      '<button class="pickchip' + (on === 'cat' ? ' on' : '') + '" onclick="nsSetRadarMode(\'cat\')">과목군별</button>' +
      '<button class="pickchip' + (on === 'subj' ? ' on' : '') + '" onclick="nsSetRadarMode(\'subj\')">과목별</button>';
  }
  if (!noteBox) return;
  const ov = nsAvgInfo(nsEntries(currentStudent)).avg;
  if (ov === null || entries.length < 3) { noteBox.innerHTML = ''; return; }
  noteBox.innerHTML =
    (entries._fallback ? '<div class="ns-foot" style="margin-top:0">과목군이 3개보다 적어 과목별로 보여 줍니다.</div>' : '') +
    nsRadarSwHtml(entries, ov);
}

// ═══════════════════════════════════════════════
// ④ 목표 시뮬레이션
// ═══════════════════════════════════════════════
function nsSimSet(area, v) {
  const g = parseInt(v, 10);
  if (g >= 1) nsSim.targets[area] = g; else delete nsSim.targets[area];
  nsRenderSim();
}
function nsSimUntil(t) { nsSim.until = t; nsRenderSim(); }
function nsSimGoal(v) { nsSim.goal = v; nsRenderSimGoal(); }
function nsSimGoalCombo(v) { nsSim.goalCombo = v; nsRenderSimGoal(); }
function nsSimReset() { nsSim.targets = {}; nsRenderSim(); }

function nsSimCalc() {
  if (nsSim.name !== currentStudent) nsSim = { name: currentStudent, targets: {}, until: NE.SUSI_LAST, goal: '', goalCombo: 'all' };
  return NE.simulate(nsEntries(currentStudent), classifySubject, { targets: nsSim.targets, until: nsSim.until });
}

function nsRenderSim() {
  const box = document.getElementById('ns-sim-content');
  if (!box) return;
  const s = nsSimCalc();
  const gm = nsGradeMax();

  const untilChips = [['3학년 1학기', '3학년 1학기까지 (수시)'], ['3학년 2학기', '3학년 2학기까지']]
    .map(([t, l]) => '<button class="pickchip' + (nsSim.until === t ? ' on' : '') + '" onclick="nsSimUntil(\'' + t + '\')">' + l + '</button>').join('');

  if (!s.last) { box.innerHTML = '<div class="note plain">성적이 없습니다.</div>'; return; }
  if (!s.future.length) {
    box.innerHTML = '<div class="pickrow">' + untilChips + '</div>' +
      '<div class="note plain">' + mkEsc(s.last) + '까지 성적이 이미 있어 ' + (nsSim.until === NE.SUSI_LAST ? '수시 반영 학기가 끝났습니다. 「3학년 2학기까지」를 눌러 보세요.' : '남은 학기가 없습니다.') + '</div>';
    return;
  }

  const sel = a => {
    let o = '';
    const changed = a in s.changed;
    if (!changed) o += '<option value="" selected>직전 그대로</option>';
    for (let g = 1; g <= gm; g++) o += '<option value="' + g + '"' + (changed && s.targets[a] === g ? ' selected' : '') + '>' + g + '등급</option>';
    return '<label class="ns-sim-in' + (changed ? ' changed' : '') + '"><span>' + NE.AREA_NAME[a] + '</span>' +
      '<select onchange="nsSimSet(\'' + a + '\', this.value)">' + o + '</select>' +
      '<small>직전 학기 ' + s.lastAvg[a].toFixed(2) + '</small></label>';
  };

  const subjCount = {};
  s.template.forEach(t => { subjCount[t.area] = (subjCount[t.area] || 0) + 1; });
  const rows = NE.COMBOS.map(c => {
    const b = s.byCombo[c.id];
    if (b.cur === null) return '';
    const d = (b.proj !== null && b.cur !== null) ? Math.round((b.proj - b.cur) * 100) / 100 : null;
    return '<tr><td style="text-align:left"><span class="ns-swatch" style="background:' + nsComboColor(c.id) + '"></span><b style="color:var(--ink)">' + c.label + '</b></td>' +
      '<td>' + nsBadge(b.cur) + '</td><td>' + nsBadge(b.proj) + '</td><td>' + nsDelta(d) + '</td></tr>';
  }).join('');

  const comboOpts = NE.COMBOS.map(c => '<option value="' + c.id + '"' + (nsSim.goalCombo === c.id ? ' selected' : '') + '>' + c.label + '</option>').join('');

  box.innerHTML =
    '<div class="pickrow">' + untilChips + '</div>' +
    '<div class="ns-foot" style="margin:-2px 0 10px">남은 학기 <b>' + s.future.map(nsShortTerm).join(', ') + '</b>에 직전 학기(' + nsShortTerm(s.last) +
      ')와 같은 과목·' + (s.weighted ? '학점' : '과목 수') + '을 듣는다고 가정합니다. 교과별로 받을 등급을 고르면 그 교과 과목을 모두 그 등급으로 계산합니다. 「직전 그대로」는 직전 학기 과목별 등급을 되풀이합니다.</div>' +
    '<div class="ns-sim-grid">' + s.areas.map(sel).join('') +
      '<button class="ns-sim-reset" onclick="nsSimReset()">' + ic('refresh', 13) + ' 직전 학기 값으로</button></div>' +
    '<div class="tbl-wrap"><table class="mk-table"><thead><tr><th style="text-align:left">조합</th><th>지금까지</th><th>예상 최종</th><th>변화</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="ns-goal">' +
      '<div class="ns-goal-q">' + ic('target', 15) + ' 최종 <select onchange="nsSimGoalCombo(this.value)">' + comboOpts + '</select> 평균을 ' +
      '<input type="number" step="0.1" min="1" max="' + gm + '" placeholder="예: 2.0" value="' + mkEsc(nsSim.goal) + '" oninput="nsSimGoal(this.value)"> 등급으로 만들려면?</div>' +
      '<div id="ns-goal-ans"></div></div>';
  nsRenderSimGoal();
}

function nsRenderSimGoal() {
  const el = document.getElementById('ns-goal-ans');
  if (!el) return;
  const goal = parseFloat(nsSim.goal);
  if (!(goal >= 1)) { el.innerHTML = '<div class="ns-foot">목표 평균을 넣으면 남은 학기에 필요한 평균 등급을 계산합니다.</div>'; return; }
  const s = nsSimCalc();
  const c = NE.comboById(nsSim.goalCombo);
  const r = NE.neededAvg(s, c.id, goal, nsGradeMax());
  const n = s.future.length;
  let html;
  if (r.status === 'none') html = '<div class="note plain">이 조합에 해당하는 과목이 남은 학기에 없습니다.</div>';
  else if (r.status === 'impossible') html = '<div class="note warn">남은 ' + n + '개 학기를 <b>모두 1등급</b>으로 받아도 ' + c.label + ' 평균은 <b>' + r.best.toFixed(2) + '</b>까지입니다. 목표를 ' + r.best.toFixed(2) + ' 이상으로 잡아 보세요.</div>';
  else if (r.status === 'done') html = '<div class="note good">지금 성적이면 남은 학기 결과와 상관없이 ' + c.label + ' ' + goal.toFixed(2) + '등급 이내를 지킵니다.</div>';
  else html = '<div class="note info">남은 ' + n + '개 학기 동안 ' + (c.id === 'all' ? '전 과목' : c.label + ' 과목') + '을 <b>평균 ' + r.need.toFixed(2) + '등급</b>으로 받으면 최종 ' + c.label + ' ' + goal.toFixed(2) + '등급이 됩니다.' +
    (r.need < 1.5 ? ' 거의 전 과목 1등급이 필요한 수준입니다.' : '') + '</div>';
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════
// ⑤ 학급 한눈에 보기 (교사용, 인쇄 안 함)
// ═══════════════════════════════════════════════
function nsSetMoverTh(v) { nsMoverTh = parseFloat(v) || 0.5; nsBuildClass(); }

function nsPickStudent(name) {
  const sel = document.getElementById('stu-sel');
  if (!sel || ![...sel.options].some(o => o.value === name)) return;
  sel.value = name;
  onStudentChange();
  if (typeof checkAll === 'function') checkAll(true);
  generateAll();
}

function nsBuildClass() {
  const box = document.getElementById('ns-class-content');
  if (!box) return;
  const cs = NE.classSummary(allStudents, classifySubject);
  if (cs.n < 2) { box.innerHTML = '<div class="note plain">학생이 2명 이상이어야 학급 통계를 낼 수 있습니다.</div>'; return; }
  const me = cs.rows.filter(r => r.name === currentStudent)[0];
  const gm = nsGradeMax();

  const tile = (t, v, s, c) => '<div class="mk-tile"><div class="t">' + t + '</div><div class="v" style="color:' + (c || 'var(--ink)') + '">' + v + '</div><div class="s">' + s + '</div></div>';
  let html = '<div class="mk-kpi">' +
    tile('학생 수', cs.n + '<span class="u">명</span>', '올린 파일 기준') +
    tile('학급 전과목 평균', nsG(cs.meanAll), '학생별 평균의 평균') +
    tile('학급 국영수 평균', nsG(cs.meanKem), '') +
    (me ? tile(mkEsc(currentStudent) + ' 위치', me.rank + '<span class="u">/' + cs.n + '</span>', '전과목 ' + nsG(me.all) + ' · 전 과목 기준', 'var(--accent)') : '') +
    '</div>';

  // 분포
  html += '<div class="ns-sub-h">전과목 평균 분포</div><div class="ns-dist-wrap"><canvas id="ns-dist-chart"></canvas></div>';

  // 과목별 학급 평균
  if (cs.subjects.length) {
    const mine = {};
    Object.values(allStudents[currentStudent] || {}).forEach(d => { if (d.term === cs.lastTerm) mine[d.subject] = d.grade; });
    const rows = cs.subjects.map(s => {
      const g = mine[s.subject];
      const d = (typeof g === 'number') ? Math.round((g - s.mean) * 100) / 100 : null;
      const w = Math.max(3, (gm + 1 - s.mean) / gm * 100);
      return '<tr><td style="text-align:left"><b style="color:var(--ink)">' + mkEsc(s.subject) + '</b></td>' +
        '<td class="ns-barcell"><span class="ns-bar" style="width:' + w + '%"></span><span class="num">' + s.mean.toFixed(2) + '</span></td>' +
        '<td>' + s.n + '명</td>' +
        '<td>' + (typeof g === 'number' ? '<span class="grade-badge g' + g + '">' + g + '</span>' : '<span style="color:var(--ink-3)">미수강</span>') + '</td>' +
        '<td>' + (d === null ? '' : nsDelta(d)) + '</td></tr>';
    }).join('');
    html += '<div class="ns-sub-h">' + mkEsc(cs.lastTerm) + ' 과목별 학급 평균</div>' +
      '<div class="tbl-wrap"><table class="mk-table"><thead><tr><th style="text-align:left">과목</th><th style="min-width:150px">학급 평균 등급</th><th>인원</th><th>' + mkEsc(currentStudent) + '</th><th>학급 대비</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // 급등락
  const mv = NE.movers(cs.rows, nsMoverTh);
  const thSel = '<select class="ns-mini-sel" onchange="nsSetMoverTh(this.value)">' +
    [0.3, 0.5, 0.7, 1.0].map(v => '<option value="' + v + '"' + (v === nsMoverTh ? ' selected' : '') + '>±' + v.toFixed(1) + '등급</option>').join('') + '</select>';
  const mrow = (r, dir) => '<div class="mk-mrow ns-click" onclick="nsPickStudent(\'' + mkEsc(r.name).replace(/'/g, "\\'") + '\')"><span class="nm">' + mkEsc(r.name) + '</span>' +
    '<span class="sum" style="color:var(--' + (dir === 'up' ? 'good' : 'bad') + ')">' + (dir === 'up' ? '+' : '−') + Math.abs(r.delta).toFixed(2) + '</span>' +
    '<span class="dt">' + nsShortTerm(r.prevTerm) + ' ' + r.prev.toFixed(2) + ' → ' + nsShortTerm(r.lastTerm) + ' ' + r.last.toFixed(2) + '</span></div>';
  const none = '<div style="font-size:11px;color:var(--ink-3);padding:4px">해당 학생이 없습니다.</div>';
  html += '<div class="ns-sub-h" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">직전 학기 대비 급등락 ' + thSel +
    '<span class="ns-foot" style="margin:0">학기 평균 등급 기준 · <b style="color:var(--good)">+</b>는 좋아진 폭 · 이름을 누르면 그 학생을 엽니다</span></div>';
  html += mv.compared
    ? '<div class="mk-movers"><div class="mk-mbox up"><h4>' + ic('arrowUp', 15) + ' 상승 (' + mv.up.length + '명)</h4>' + (mv.up.length ? mv.up.map(r => mrow(r, 'up')).join('') : none) + '</div>' +
      '<div class="mk-mbox down"><h4>' + ic('arrowDown', 15) + ' 하락 (' + mv.down.length + '명)</h4>' + (mv.down.length ? mv.down.map(r => mrow(r, 'down')).join('') : none) + '</div></div>'
    : '<div class="note plain">학기가 2개 이상인 학생이 없어 비교할 수 없습니다. 일람표는 한 학기 자료입니다.</div>';

  box.innerHTML = html;

  // 분포 차트 — 이 학생이 든 칸만 강조
  nsDestroy('dist');
  const cv = document.getElementById('ns-dist-chart');
  if (!cv || typeof Chart === 'undefined') return;
  const bins = NE.histogram(cs.rows, gm);
  let last = bins.length - 1;
  while (last > 0 && !bins[last].n) last--;
  const shown = bins.slice(0, Math.max(last + 1, 4));
  const myBin = me ? shown.findIndex(b => me.all >= b.lo && (me.all < b.hi || b === shown[shown.length - 1])) : -1;
  nsCharts.dist = new Chart(cv.getContext('2d'), {
    type: 'bar',
    data: {
      labels: shown.map(b => b.lo.toFixed(1) + '~' + b.hi.toFixed(1)),
      datasets: [{
        data: shown.map(b => b.n),
        backgroundColor: shown.map((b, i) => i === myBin ? mkCss('--accent') : mkCss('--accent', 0.22)),
        borderRadius: 4, maxBarThickness: 46
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' } },
        x: { ticks: { font: { size: 10 } }, title: { display: true, text: '전과목 평균 등급 (왼쪽이 좋은 등급)', font: { size: 10 } } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.parsed.y + '명', afterLabel: c => shown[c.dataIndex].names.join(', ') } }
      }
    }
  });
}

// ═══════════════════════════════════════════════
// 프롬프트 · 엑셀
// ═══════════════════════════════════════════════
function nsPromptBlock(name) {
  if (!nsHigh() || !(allStudents || {})[name]) return '';
  const xs = nsEntries(name);
  const ca = NE.comboAvgs(xs, classifySubject);
  let p = '평균 산출 방식: ' + (ca.all.weighted ? '학점 가중 (이수 학점 합 ' + ca.all.units + '학점)' : '단순 평균 (학점 정보 없음)') + '\n';
  p += '반영 조합별 평균: ' + NE.COMBOS.map(c => c.label + ' ' + nsG(ca[c.id].avg)).join(' / ') + '\n';
  const ts = NE.termSeries(xs, classifySubject);
  if (ts.terms.length >= 2) {
    p += '학기별 평균 추이:\n';
    NE.COMBOS.forEach(c => {
      const l = ts.byCombo[c.id].filter(x => x.avg !== null);
      if (l.length >= 2) p += '- ' + c.label + ': ' + l.map(x => nsShortTerm(x.term) + ' ' + x.avg.toFixed(2)).join(' → ') + '\n';
    });
  }
  const pvT = [...nsProvTermsOf(name)];
  if (pvT.length) p += '※ ' + pvT.join(', ') + ' 성적은 학기가 끝나기 전 1차 고사(전과목 성적 일람표) 석차로 낸 예상 등급입니다. 확정 성적이 아닙니다.\n';
  const ao = nsAchOnly[name] || [];
  if (ao.length) p += '성취도만 있는 과목(등급 평균 제외): ' + ao.map(d => d.subject + '(' + nsShortTerm(d.term) + ' ' + (d.achieve || '-') + ')').join(', ') + '\n';
  return p;
}

/** 개인 엑셀에 '반영 조합 평균' 시트 */
function nsAddExcelSheet(wb, name) {
  if (!nsHigh() || !(allStudents || {})[name]) return;
  const xs = nsEntries(name);
  const ts = NE.termSeries(xs, classifySubject);
  if (!ts.terms.length) return;
  const ws = wb.addWorksheet('반영 조합 평균');
  const ca = NE.comboAvgs(xs, classifySubject);
  ws.getCell(1, 1).value = name + ' 반영 조합별 평균 (' + (ca.all.weighted ? '학점 가중' : '단순 평균') + ')';
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  const head = ['조합', '전체'].concat(ts.terms);
  const put = (r, title, key) => {
    ws.getCell(r, 1).value = title; ws.getCell(r, 1).font = { bold: true, size: 11 };
    head.forEach((h, i) => { const c = ws.getCell(r + 1, i + 1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: 'center' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F5' } }; });
    NE.COMBOS.forEach((c, k) => {
      const row = r + 2 + k;
      ws.getCell(row, 1).value = c.label;
      ws.getCell(row, 2).value = ca[c.id].avg === null ? '-' : Number(ca[c.id].avg.toFixed(2));
      ts.byCombo[c.id].forEach((p, i) => { ws.getCell(row, 3 + i).value = p[key] === null ? '-' : p[key]; ws.getCell(row, 3 + i).alignment = { horizontal: 'center' }; });
    });
    return r + 2 + NE.COMBOS.length + 1;
  };
  let r = put(3, '학기별 평균', 'avg');
  put(r, '그 학기까지 누적 평균', 'cum');
  ws.getColumn(1).width = 14;
  for (let i = 2; i <= head.length; i++) ws.getColumn(i).width = 12;
}

// ═══════════════════════════════════════════════
// 한 등급만 올리면 되는 과목 — 순위 기준
// ═══════════════════════════════════════════════
// 원래 calcGap은 등급제마다 단위가 다른 값으로 줄 세웠다 (9등급 = 필요 점수, 5등급 = %p, 일람표 = 추월 인원).
// 카드에는 「앞 N명 추월 필요」가 보이는데 순서는 다른 값으로 정해져, 3명이 6위·8명이 1위로 나왔다.
// → 추월 인원(getPeopleAhead)이 있으면 그것으로, 같으면 원래 차이로 줄 세운다. 인원을 모르는 과목은 뒤로.
function nsGapByAhead(nm, studentName, subjectKey) {
  if (!nm) return nm;
  let pa = null;
  try { pa = (studentName && subjectKey) ? getPeopleAhead(subjectKey, studentName) : null; } catch (e) { pa = null; }
  const ahead = pa && typeof pa.peopleAhead === 'number' && isFinite(pa.peopleAhead) ? pa.peopleAhead : null;
  nm.gapKey = nm.sortKey;   // 원래 차이 (같은 인원일 때 보조 기준)
  nm.ahead = ahead;
  // 엑셀이 sortKey로 급한 정도(5명·15명 이하)를 칠하므로 sortKey도 추월 인원으로 맞춘다
  if (ahead !== null) nm.sortKey = ahead;

  // 막대·「아쉬운 정도」도 같은 기준으로: 지금 등급에 든 인원(band) 중 내 앞에 몇 명인가.
  // 원래 막대는 9등급 = 필요 점수, 5등급 = 원점수−평균으로 짐작한 %p라 순서와 어긋났다.
  nm.band = nsGapBand(pa);
  if (nm.band) {
    const ptNeed = nm.system === '9등급' && typeof nm.gap === 'number' ? ' · ' + nm.gap.toFixed(1) + '점 필요' : '';
    nm.gapLabel = '같은 등급 ' + nm.band.size + '명 중 앞 ' + (pa.estimated ? '약 ' : '') + ahead + '명' + ptNeed;
  }
  return nm;
}

/** 지금 등급에 든 인원과, 그 안에서 위쪽 커트까지 온 정도(fill 0~1, 1 = 바로 커트 아래) */
function nsGapBand(pa) {
  if (!pa || typeof pa.peopleAhead !== 'number' || !pa.total || !pa.vGrade) return null;
  const cuts = getGradeCuts(pa.gradeSystem);
  const g = pa.vGrade;
  if (g < 2) return null;
  const top = pa.cutRank;
  const bottom = g - 1 < cuts.length ? Math.round(cuts[g - 1] * pa.total) : pa.total;
  const size = Math.max(1, bottom - top, pa.peopleAhead + 1);   // 반올림으로 앞 인원보다 작아지지 않게
  return { size: size, fill: Math.max(0, Math.min(1, 1 - pa.peopleAhead / size)) };
}

/** 한 등급 올리기 카드의 막대 길이(%) — 위치를 모르면 null (막대를 숨긴다) */
function nsGapBar(it) {
  if (!it || !it.band) return null;
  return Math.max(4, Math.min(98, it.band.fill * 100));
}
function nsGapCompare(a, b) {
  const ha = a.ahead !== null && a.ahead !== undefined, hb = b.ahead !== null && b.ahead !== undefined;
  if (ha !== hb) return ha ? -1 : 1;
  if (ha && a.ahead !== b.ahead) return a.ahead - b.ahead;
  const ka = a.gapKey !== undefined ? a.gapKey : a.sortKey, kb = b.gapKey !== undefined ? b.gapKey : b.sortKey;
  return ka - kb;
}

// ═══════════════════════════════════════════════
// 등급 변화 추이 — 교과별 평균 선
// ═══════════════════════════════════════════════
// 원래 「전체과목」 탭은 과목 하나를 선 하나로 그렸다. 고교학점제에선 대부분 한두 학기만 개설되니
// 2학년 과목은 전부 떨어진 점이 되고, 공통국어 → 문학처럼 과목이 바뀌면 선이 끊겼다.
// → 교과(과목군)마다 그 학기 과목들의 학점 가중 평균을 찍는다. 계열 탭과 같은 계산이다.
//    점에 올리면 그 학기에 들은 과목과 등급이 나온다(_subs).

/** subjects를 교과별로 묶어 학기별 평균 줄을 만든다. 교과 순서는 CATEGORY_MAP 순. */
function nsTrendCatLines(data, subjects, terms) {
  const groups = {};
  (subjects || []).forEach(s => { const c = classifySubject(s); (groups[c] = groups[c] || []).push(s); });
  const order = CATEGORY_MAP.map(c => c.name);
  return Object.keys(groups)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map(cat => {
      const info = CATEGORY_MAP.find(c => c.name === cat) || CATEGORY_MAP[CATEGORY_MAP.length - 1];
      const pts = [], subs = [], prov = [];
      terms.forEach(t => {
        const ents = groups[cat].map(s => (data || {})[s + '__' + t]).filter(Boolean);
        const v = nsAvgInfo(ents).avg;
        pts.push(v === null ? null : parseFloat(v.toFixed(2)));
        subs.push(ents.length ? ents.map(d => ({ subject: d.subject, grade: d.grade, prov: nsIsProv(d) })) : null);
        prov.push(ents.length > 0 && ents.every(nsIsProv));   // 1차 고사 일람표에서 온 예상 등급
      });
      return { cat: cat, color: info.color, pts: pts, subs: subs, prov: prov };
    })
    .filter(x => x.pts.some(p => p !== null));
}

/** Chart.js 데이터셋 하나로 */
function nsTrendDataset(line, big) {
  return {
    label: line.cat, data: line.pts, _subs: line.subs, _prov: line.prov,
    borderColor: line.color, backgroundColor: line.color + '22',
    borderWidth: big ? 2.5 : 2, pointRadius: big ? 5 : 4, pointHoverRadius: 8,
    pointBackgroundColor: nsProvPointFill(line.prov, line.color), pointBorderWidth: 2,
    segment: nsProvSegment(line.prov), tension: 0.2, spanGaps: true
  };
}

/** 예상 학기로 들어가는 선은 점선 — 확정 → 예상 구간 */
function nsProvSegment(prov) {
  return { borderDash: ctx => (prov && prov[ctx.p1DataIndex]) ? [6, 5] : undefined };
}
/** 예상 점은 속이 빈 동그라미 */
function nsProvPointFill(prov, color) {
  return (prov || []).map(p => p ? '#ffffff' : color);
}
/** x축 이름: 예상 학기는 두 줄로 「2학년 2학기 / (예상)」 */
function nsProvLabels(terms, provSet) {
  return terms.map(t => provSet && provSet.has(t) ? [t, '(예상)'] : t);
}

/** 툴팁: 「국어 평균 2.33등급」 + 그 학기 과목들 (한 과목뿐이면 한 줄) */
function nsTrendTooltip(ctx, isMid) {
  const subs = ctx.dataset._subs && ctx.dataset._subs[ctx.dataIndex];
  if (!subs) return null;
  const ach = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };
  const g = v => isMid ? (ach[v] || v) : v + '등급';
  const pv = s => s.prov ? ' (예상)' : '';
  if (subs.length === 1) return subs[0].subject + ': ' + g(subs[0].grade) + pv(subs[0]);
  const allProv = subs.every(s => s.prov);
  return [ctx.dataset.label + ' 평균 ' + ctx.parsed.y + (isMid ? '' : '등급') + (allProv ? ' (1차 고사 예상)' : '')]
    .concat(subs.map(s => '  · ' + s.subject + ' ' + g(s.grade) + (allProv ? '' : pv(s))));
}

// ═══════════════════════════════════════════════
// 내신 파일 합치기 — 교과학습발달상황(확정) + 전과목 성적 일람표(예상)
// ═══════════════════════════════════════════════
// 예전에는 내신 파일을 올릴 때마다 통째로 바뀌었다. 2학년 1학기까지의 교과학습발달상황 뒤에
// 2학년 2학기 1차 고사 일람표를 올리면 지난 학기 기록이 사라졌다.
// 이제는 학생·과목·학기 단위로 합친다.
//   · 같은 칸이 겹치면 확정(교과학습발달상황)이 이긴다. 일람표끼리는 나중 것이 이긴다.
//   · 교과학습발달상황에 어떤 학기가 들어오면 그 학기의 예상(일람표) 칸은 지운다 — 학기가 끝나 확정됐으니까.
//   · 일람표 칸(isIlam)은 1차 고사 석차로 낸 「예상 등급」으로 표시한다.
let nsMergeOff = false;        // 저장분 복원처럼 통째로 바꿔야 할 때 true
let nsMergeInfo = null;        // 마지막 합치기 결과 (안내 문구용)
let nsNaesinLabel = '';        // 합친 파일 이름들

function nsIsProv(d) { return !!(d && d.isIlam); }

/** 이 학생의 「예상」 학기 — 그 학기 칸이 모두 일람표에서 온 경우 */
function nsProvTerms(data) {
  const by = {};
  Object.values(data || {}).forEach(d => {
    if (!d || !d.term) return;
    const b = by[d.term] || (by[d.term] = { prov: 0, all: 0 });
    b.all++; if (nsIsProv(d)) b.prov++;
  });
  return new Set(Object.keys(by).filter(t => by[t].prov && by[t].prov === by[t].all));
}
function nsProvTermsOf(name) { return nsProvTerms((allStudents || {})[name]); }

/** applyParseResult 맨 앞에서 부른다 — 새로 읽은 내신을 기존 것과 합쳐 돌려준다 */
function nsMergeNaesin(incoming, isIlam, isMid) {
  nsMergeInfo = null;
  const prev = allStudents || {};
  const prevNames = Object.keys(prev);
  if (nsMergeOff || !prevNames.length) { nsNaesinLabel = lastFileName || ''; return incoming; }

  const inNames = Object.keys(incoming || {});
  const common = inNames.filter(n => prev[n]).length;
  if (common < Math.min(prevNames.length, inNames.length) / 2) {
    if (!confirm('지금 들어 있는 내신과 학생이 대부분 다릅니다 (겹치는 학생 ' + common + '명).\n\n' +
      '  확인 — 합치기 (두 파일 학생을 모두 보관)\n  취소 — 바꾸기 (새 파일만 남김)')) {
      nsNaesinLabel = lastFileName || '';
      return incoming;
    }
  }

  const out = JSON.parse(JSON.stringify(prev));
  const info = { kind: isIlam ? 'ilam' : 'neis', added: 0, replaced: 0, keptFinal: 0, dropped: 0, finalized: 0, terms: new Set() };
  inNames.forEach(name => {
    const src = incoming[name] || {};
    const dst = out[name] || (out[name] = {});
    if (!isIlam) {
      // 확정 성적이 들어온 학기는 예상 칸을 비운다
      const finalTerms = new Set(Object.values(src).map(d => d.term));
      Object.keys(dst).forEach(k => {
        if (nsIsProv(dst[k]) && finalTerms.has(dst[k].term) && !src[k]) { delete dst[k]; info.dropped++; }
      });
    }
    Object.keys(src).forEach(k => {
      const d = src[k], ex = dst[k];
      info.terms.add(d.term);
      if (!ex) { dst[k] = d; info.added++; return; }
      if (isIlam && !nsIsProv(ex)) { info.keptFinal++; return; }   // 확정이 이긴다
      if (!isIlam && nsIsProv(ex)) info.finalized++;              // 예상 → 확정
      dst[k] = d; info.replaced++;
    });
  });
  // 성취도만 있는 과목 목록(숨은 속성)은 JSON 복사에서 빠지므로 따로 합친다. 새 확정 파일이면 그 학생 것은 새 것으로.
  const ach = Object.assign({}, nsAchOnly || {}, (incoming && incoming.__achOnly) || {});
  Object.defineProperty(out, '__achOnly', { value: ach, enumerable: false });
  nsMergeInfo = info;
  nsNaesinLabel = (nsNaesinLabel && nsNaesinLabel !== lastFileName ? nsNaesinLabel + ' + ' : '') + (lastFileName || '');
  lastFileName = nsNaesinLabel;
  return out;
}

/** 합친 뒤: 석차 원본(ilamData)을 합친 칸에서 다시 만들고, 등급제 최댓값을 다시 잡는다 */
function nsAfterMerge() {
  const raw = {};
  let any = false, nine = false;
  Object.entries(allStudents || {}).forEach(([name, subj]) => {
    Object.entries(subj || {}).forEach(([k, d]) => {
      if (d && !d.isMid && (d.grade > 5 || d.gradeSystem === 9)) nine = true;
      if (!nsIsProv(d) || !d.rank) return;
      any = true;
      (raw[name] || (raw[name] = {}))[k] = { subject: d.subject, term: d.term, score: d.score, rank: d.rank, tieCount: d.tieCount || 1, total: d.total };
    });
  });
  ilamData = any ? raw : null;
  if (currentSchoolLevel !== 'middle') gradeSystemMax = nine ? 9 : 5;
}

/** 불러온 뒤 안내 */
function nsMergeToast(n) {
  const m = nsMergeInfo;
  if (!m || (!m.added && !m.replaced && !m.dropped)) { showToast(n + '명을 불러왔습니다.'); return; }
  const terms = [...m.terms].sort().join(', ');
  if (m.kind === 'ilam') {
    showToast('기존 내신에 ' + terms + ' 일람표를 합쳤습니다 — 예상 등급으로 표시합니다' + (m.keptFinal ? ' (이미 확정된 ' + m.keptFinal + '칸은 그대로)' : '') + '.');
  } else {
    const fin = m.finalized + m.dropped;
    showToast(fin ? '학기말 확정 성적이 들어와 예상 등급 ' + fin + '칸을 확정 성적으로 바꿨습니다.' : '내신을 합쳤습니다.');
  }
}

/** 성적표 머리 칸 · 등급 칸 꼬리표 */
function nsProvTh(data, t) {
  return nsProvTerms(data).has(t) ? '<br><span class="ns-prov">1차 고사 · 예상</span>' : '';
}

/* ══════════════ 상담/care-engine.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   상담 우선순위 엔진 (care-engine.js)
   ───────────────────────────────────────────────────────────────
   순수 함수만. DOM도 전역 성적 데이터도 모른다. Node에서 바로 검증한다.

   학생마다 네 가지 신호를 본다. 각 신호는 세기 1~3이고, 점수는 세기의 합이다.
     drop     내신 하락     직전 학기보다 학기 평균 등급이 나빠졌다
     near     등급 경계     자기 등급 구간의 위쪽 20% 안이라 조금만 올리면 한 등급 오르는 과목
     gap      내신·모의 격차 두 성적이 9등급 기준으로 크게 벌어졌다 (방향은 따지지 않는다)
     mockDrop 모의 하락     직전 회차보다 반영 과목 평균 등급이 나빠졌다

   점수는 "누구부터 볼까"를 정하는 순서일 뿐 학생 평가가 아니다.
   그래서 화면에만 두고 인쇄하지 않는다.

   1위·2위처럼 순위를 매기지 않는다. 점수가 같은 학생이 많아 「8위 9명」 같은
   공동 순위가 생기고, 점수 1점 차이를 순위로 보이면 실제보다 큰 차이처럼 읽힌다.
   대신 점수 구간으로 세 묶음(먼저 · 이어서 · 지켜보기)으로 나눈다.

   입력 한 줄:
     { name,
       no:       번호 (선택) — 같은 점수 안에서 번호 순으로 놓는다
       naesin:   { prevTerm, lastTerm, prev, last, delta } | null    delta>0 = 나빠짐
       near:     [{ subject, term, pos, ahead, total, estimated }]   (경계 판정 전 전체 목록이어도 된다)
                 pos = 자기 등급 구간 안의 위치 0~1 (0 = 바로 위 등급 커트). 수강자 비율로 재면
                 9등급 구간 폭이 4~20%로 달라 넓은 등급은 거의 다 걸린다 → 구간 안 위치로 잰다.
       gap:      { naesin9, mock, delta } | null                     delta = 내신9 − 모의 (>0 = 모의가 좋다)
       mock:     { prevLabel, lastLabel, prev, last, delta } | null  delta>0 = 나빠짐
     }
   ═══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /** 세기 1·2·3이 되는 경계. 값이 이보다 크거나 같으면 그 세기다. */
  const LEVELS = {
    drop: [0.5, 0.8, 1.2],      // 학기 평균 등급 하락폭
    near: [2, 3, 4],            // 경계 과목 수
    gap: [1.0, 1.5, 2.0],       // |내신9 − 모의|
    mockDrop: [0.5, 1.0, 1.5]   // 반영 과목 평균 등급 하락폭
  };
  /** 경계 과목: 자기 등급 구간에서 위쪽 이 비율 안 (0.2 = 구간 위 20%) */
  const NEAR_POS = 0.2;

  /** 묶음 — 점수가 min 이상이면 그 묶음 (위에서부터) */
  const TIERS = [
    { key: 'first', label: '먼저 상담', min: 4, hint: '신호가 겹쳤거나 센 신호가 있는 학생' },
    { key: 'next', label: '이어서 상담', min: 2, hint: '중간 세기 신호가 있는 학생' },
    { key: 'watch', label: '지켜보기', min: 1, hint: '약한 신호 하나 — 다음 성적에서 다시 확인' }
  ];
  function tierOf(score) {
    for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) return TIERS[i].key;
    return null;
  }

  const KINDS = [
    { key: 'drop', label: '내신 하락' },
    { key: 'near', label: '등급 경계' },
    { key: 'gap', label: '내신·모의 격차' },
    { key: 'mockDrop', label: '모의 하락' }
  ];

  const fin = v => typeof v === 'number' && isFinite(v);
  const r2 = v => Math.round(v * 100) / 100;

  function levelOf(kind, v) {
    const th = LEVELS[kind];
    if (!th || !fin(v)) return 0;
    let lv = 0;
    th.forEach((t, i) => { if (v >= t - 1e-9) lv = i + 1; });
    return lv;
  }

  /** 등급 구간 위쪽 NEAR_POS 안의 과목만, 추월 인원이 적은 순으로 (인원을 모르면 뒤, 그다음 커트에 가까운 순) */
  function nearList(list) {
    return (list || [])
      .filter(x => x && fin(x.pos) && x.pos >= 0 && x.pos <= NEAR_POS + 1e-9)
      .slice()
      .sort((a, b) => (fin(a.ahead) ? a.ahead : 1e9) - (fin(b.ahead) ? b.ahead : 1e9) || a.pos - b.pos ||
        String(a.subject).localeCompare(String(b.subject), 'ko'));
  }

  /** 한 학생의 신호 목록 */
  function flagsOf(s) {
    const out = [];
    const n = s.naesin;
    if (n && fin(n.delta)) {
      const lv = levelOf('drop', n.delta);
      if (lv) out.push({ kind: 'drop', level: lv, value: r2(n.delta), from: n.prev, to: n.last, fromLabel: n.prevTerm, toLabel: n.lastTerm });
    }
    const near = nearList(s.near);
    const nlv = levelOf('near', near.length);
    if (nlv) out.push({ kind: 'near', level: nlv, value: near.length, subjects: near });

    const g = s.gap;
    if (g && fin(g.delta)) {
      const lv = levelOf('gap', Math.abs(g.delta));
      // dir: 'mock' = 모의가 더 좋다, 'naesin' = 내신이 더 좋다
      if (lv) out.push({ kind: 'gap', level: lv, value: r2(Math.abs(g.delta)), dir: g.delta > 0 ? 'mock' : 'naesin', naesin9: g.naesin9, mock: g.mock });
    }
    const m = s.mock;
    if (m && fin(m.delta)) {
      const lv = levelOf('mockDrop', m.delta);
      if (lv) out.push({ kind: 'mockDrop', level: lv, value: r2(m.delta), from: m.prev, to: m.last, fromLabel: m.prevLabel, toLabel: m.lastLabel });
    }
    return out;
  }

  /**
   * 학급 전체를 상담 순서로 줄 세우고 묶음(tier)을 붙인다.
   * 점수(세기 합) → 신호 개수 → 가장 센 신호 → 번호 → 이름 순.
   * 신호가 하나도 없는 학생은 calm으로 따로 돌려준다 (번호 순).
   */
  function rank(students) {
    const rows = [], calm = [];
    (students || []).forEach(s => {
      if (!s || !s.name) return;
      const flags = flagsOf(s);
      if (!flags.length) { calm.push({ name: s.name, no: s.no }); return; }
      const score = flags.reduce((a, f) => a + f.level, 0);
      const top = flags.reduce((a, f) => Math.max(a, f.level), 0);
      rows.push({ name: s.name, no: s.no, score: score, top: top, tier: tierOf(score), flags: flags,
        has: { naesin: !!s.naesin || (s.near || []).length > 0, mock: !!s.mock || !!s.gap } });
    });
    rows.sort((a, b) => b.score - a.score || b.flags.length - a.flags.length || b.top - a.top || byNo(a, b));
    calm.sort(byNo);

    const counts = {};
    KINDS.forEach(k => { counts[k.key] = rows.filter(r => r.flags.some(f => f.kind === k.key)).length; });
    const tiers = TIERS.map(t => Object.assign({}, t, { rows: rows.filter(r => r.tier === t.key) }));
    return { rows: rows, tiers: tiers, calm: calm.map(c => c.name), counts: counts, total: rows.length + calm.length };
  }

  /** 번호 순 (번호가 없으면 뒤로, 그다음 이름). 번호는 '12' 또는 반이 붙은 '3-12' */
  function byNo(a, b) {
    const n = v => { const x = parseFloat(String(v == null ? '' : v).split('-').pop()); return isFinite(x) ? x : null; };
    const na = n(a.no), nb = n(b.no);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if ((na === null) !== (nb === null)) return na === null ? 1 : -1;
    return String(a.name).localeCompare(String(b.name), 'ko');
  }

  /** 신호 하나를 한 줄 설명으로 (화면·엑셀 공용) */
  function describe(f) {
    const g = v => fin(v) ? v.toFixed(2) : '-';
    if (f.kind === 'drop') return (f.fromLabel || '') + ' ' + g(f.from) + ' → ' + (f.toLabel || '') + ' ' + g(f.to) + ' (' + f.value.toFixed(2) + '등급 하락)';
    if (f.kind === 'near') return f.value + '과목 — ' + f.subjects.map(x => x.subject + (fin(x.ahead) ? ' 앞 ' + (x.estimated ? '약 ' : '') + x.ahead + '명' : '')).join(', ');
    if (f.kind === 'gap') return (f.dir === 'mock' ? '모의가 내신보다 ' : '내신이 모의보다 ') + f.value.toFixed(2) + '등급 좋음 (내신 ' + g(f.naesin9) + ' · 모의 ' + g(f.mock) + ', 9등급 기준)';
    if (f.kind === 'mockDrop') return (f.fromLabel || '') + ' ' + g(f.from) + ' → ' + (f.toLabel || '') + ' ' + g(f.to) + ' (' + f.value.toFixed(2) + '등급 하락)';
    return '';
  }

  const api = { LEVELS, NEAR_POS, KINDS, TIERS, tierOf, levelOf, nearList, flagsOf, rank, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CareEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* ══════════════ 상담/care-ui.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   상담 우선순위 탭 (care-ui.js)
   ───────────────────────────────────────────────────────────────
   반 전체를 훑어 "누구부터 상담할지"를 한 화면에 줄 세운다.
   학생을 고르지 않아도 볼 수 있다. 계산은 care-engine.js, 재료는 기존 함수에서 가져온다.
     내신 하락   NaesinEngine.classSummary (학점 가중 학기 평균)
     등급 경계   clampedEntryPct + getPeopleAhead (일람표는 실제 석차, 교과학습발달상황은 추정)
     격차       naesinAvg9For + judgeTrack (수시·정시 판정과 같은 9등급 축)
     모의 하락   examSeries + examDelta     (반영 과목 평균)

   학생 이름이 나란히 나오는 교사용 화면이라 인쇄·프롬프트는 두지 않는다. 엑셀만 낸다.
   ═══════════════════════════════════════════════════════════════ */

const CE = window.CareEngine;
let careFilter = 'all';

function careNames() {
  if (typeof mkBatchNames === 'function') return mkBatchNames();
  return Object.keys(allStudents || {});
}

/** 데이터가 2명 이상이면 상담 우선순위를 볼 수 있다 */
function careAvailable() {
  try { return careNames().length >= 2; } catch (e) { return false; }
}

/** 기존 전역 데이터에서 엔진 입력을 만든다 */
function careInputs() {
  const all = allStudents || {};
  const mocks = (typeof mockStudents !== 'undefined' && mockStudents) || {};
  const high = currentSchoolLevel !== 'middle';

  const nsRows = {};
  if (Object.keys(all).length && typeof NaesinEngine !== 'undefined') {
    NaesinEngine.classSummary(all, classifySubject).rows.forEach(r => { nsRows[r.name] = r; });
  }

  return careNames().map(name => {
    const row = nsRows[name];
    const s = { name: name, no: typeof stuNoOf === 'function' ? stuNoOf(name) : '', naesin: null, near: [], gap: null, mock: null };

    if (row && row.delta !== null) {
      // 마지막 학기가 1차 고사 일람표로 낸 예상 등급이면 그렇게 적는다 (내신 합치기)
      const pv = typeof nsProvTermsOf === 'function' ? nsProvTermsOf(name) : new Set();
      const lab = t => t + (pv.has(t) ? ' (예상)' : '');
      s.naesin = { prevTerm: lab(row.prevTerm), lastTerm: lab(row.lastTerm), prev: row.prev, last: row.last, delta: row.delta };
    }
    // 등급 경계 — 가장 최근 학기 과목만 (지난 학기 과목은 이미 끝났다)
    if (row && all[name]) Object.keys(all[name]).forEach(key => {
      const d = all[name][key];
      if (!d || d.term !== row.lastTerm || !(d.grade > 1)) return;
      const p = carePos(d, key, name);
      if (!p) return;
      let pa = null;
      try { pa = typeof getPeopleAhead === 'function' ? getPeopleAhead(key, name) : null; } catch (e) { pa = null; }
      s.near.push({ subject: d.subject, term: d.term, pos: p.pos,
        ahead: pa ? pa.peopleAhead : null, total: pa ? pa.total : null, estimated: !p.exact });
    });

    const stu = mocks[name];
    if (high && stu && typeof ME !== 'undefined') {
      // 격차 — 이 탭은 반 전체 기준이라 과목 선택과 상관없이 전 과목으로 본다
      if (all[name] && typeof naesinAvg9For === 'function') {
        const n9 = naesinAvg9For(name, new Set());
        if (n9 !== null) {
          const j = ME.judgeTrack(n9, stu, { weightSet: mockWeight, mergeTamgu: mockMergeTamgu });
          if (!j.incomplete) s.gap = { naesin9: j.naesin9, mock: j.mockAvg, delta: j.delta };
        }
      }
      const series = ME.examDelta(ME.examSeries(stu, mockWeight, mockMergeTamgu));
      const last = series[series.length - 1];
      if (last && last.delta !== null && series.length > 1) {
        const prev = series[series.length - 2];
        s.mock = { prevLabel: prev.label, lastLabel: last.label, prev: prev.mainAvg, last: last.mainAvg, delta: last.delta };
      }
    }
    return s;
  });
}

/**
 * 자기 등급 구간 안의 위치 (0 = 바로 위 등급 커트, 1 = 바로 아래 등급 커트).
 * 석차가 없는 파일은 원점수·평균·표준편차(또는 성취도 분포)로 추정한 백분위를 쓴다.
 * 추정 백분위가 기록된 등급보다 좋게 나오면 구간 꼭대기로 맞춰져 "앞 약 1명"처럼 보이지만
 * 실제로는 위치를 모르는 것이라 뺀다. 원점수 없이 등급만 있는 경우도 뺀다.
 */
function carePos(d, key, name) {
  if (typeof calcPercentileInfo !== 'function' || typeof clampedEntryPct !== 'function') return null;
  let info = null, c = null;
  try { info = calcPercentileInfo(d, key, name); c = clampedEntryPct(d, key, name); } catch (e) { return null; }
  if (!info || !c || !info.precise || !(c.hi > c.lo)) return null;
  if (info.pct < c.lo - 1e-9 || info.pct > c.hi + 1e-9) return null;
  return { pos: (info.pct - c.lo) / (c.hi - c.lo), exact: !!(d.rank && d.total) };
}

function careResult() { return CE.rank(careInputs()); }

// ═══════════════════════════════════════════════
// 화면
// ═══════════════════════════════════════════════
const CARE_TONE = { drop: 'bad', near: 'accent', gap: 'warn', mockDrop: 'bad' };
const CARE_ICON = { drop: 'arrowDown', near: 'target', gap: 'scale', mockDrop: 'trend' };

function careLabel(kind) { return (CE.KINDS.filter(k => k.key === kind)[0] || {}).label || kind; }

function careLevelHtml(lv, tone) {
  let h = '<span class="cr-lv" title="세기 ' + lv + ' / 3">';
  for (let i = 1; i <= 3; i++) h += '<i' + (i <= lv ? ' class="on" style="background:var(--' + tone + ')"' : '') + '></i>';
  return h + '</span>';
}

function careFlagHtml(f) {
  const tone = CARE_TONE[f.kind];
  return '<div class="cr-flag">' +
    '<span class="cr-tag" style="color:var(--' + tone + ')">' + ic(CARE_ICON[f.kind], 13) + ' ' + careLabel(f.kind) + '</span>' +
    careLevelHtml(f.level, tone) +
    '<span class="cr-desc">' + mkEsc(CE.describe(f)) + '</span></div>';
}

function careSetFilter(k) { careFilter = k; renderCareTab(); }

const CARE_TIER_TONE = { first: 'bad', next: 'warn', watch: 'ink-3' };

/** 이름 버튼 — 누르면 그 학생 분석이 열린다는 걸 화살표로 보여 준다 */
function careNameBtn(name, cls) {
  return '<button class="cr-name' + (cls ? ' ' + cls : '') + '" data-n="' + mkEsc(name) + '" onclick="carePick(this.dataset.n)" title="' +
    mkEsc(name) + ' 학생 분석 열기">' + '<span>' + mkEsc(name) + '</span>' + ic('chevRight', 13) + '</button>';
}
function careNoHtml(no) { return no ? '<span class="cr-no">' + mkEsc(no) + '</span>' : '<span class="cr-no none">-</span>'; }

function renderCareTab() {
  const wrap = document.getElementById('tab-care');
  if (!wrap) return;
  if (!careAvailable()) {
    wrap.innerHTML = '<div class="result-card">' + mkEmpty('users', '학생이 2명 이상이어야 합니다',
      '왼쪽에 <b>내신 성적</b>이나 <b>모의고사 성적</b>을 학급 단위로 올리면<br>반 전체에서 먼저 상담할 학생을 골라 드립니다.') + '</div>';
    return;
  }
  const res = careResult();
  if (careFilter !== 'all' && !res.counts[careFilter]) careFilter = 'all';
  const rows = careFilter === 'all' ? res.rows : res.rows.filter(r => r.flags.some(f => f.kind === careFilter));

  let html = '<div class="mk-teacher-only">' + ic('lock', 15) +
    '<div><b>교사용 화면입니다. 인쇄되지 않습니다.</b>' +
    '<span>반 학생 이름과 상담 순서가 함께 나오므로 화면으로만 보시고, 필요하면 엑셀로 받아 두세요.</span></div></div>';

  html += '<div class="result-card"><div class="result-title">' + ic('users', 17) + ' 상담 우선순위</div>' +
    '<div class="card-sub">반 전체에서 <b>먼저 살펴볼 학생</b>을 줄 세웠습니다. 신호마다 세기를 1~3으로 매겨 더한 값이 점수입니다. ' +
    '점수에 따라 <b>먼저 상담 · 이어서 상담 · 지켜보기</b> 세 묶음으로 나눴고, 묶음 안에서는 점수가 높은 학생부터, 같으면 번호 순입니다. ' +
    '점수는 상담 순서를 정하려는 것이지 학생 평가가 아닙니다.</div>' +
    '<div class="cr-howto">' + ic('chevRight', 13) + ' 학생 이름을 누르면 그 학생의 내신·모의고사 분석 화면으로 바로 넘어갑니다.</div>';

  const chip = (k, label, n) => '<button class="pickchip' + (careFilter === k ? ' on' : '') + '" onclick="careSetFilter(\'' + k + '\')"' + (n ? '' : ' disabled') + '>' +
    label + ' <span class="n">' + n + '</span></button>';
  html += '<div class="pickrow">' + chip('all', '살펴볼 학생', res.rows.length) +
    CE.KINDS.map(k => chip(k.key, k.label, res.counts[k.key])).join('') + '</div>';

  if (!res.rows.length) {
    html += '<div class="note good">눈에 띄는 신호가 있는 학생이 없습니다. 아래 기준을 넘는 변화가 없다는 뜻입니다.</div>';
  } else {
    const shown = new Set(rows);
    html += '<div class="tbl-wrap"><table class="mk-table cr-table"><thead><tr>' +
      '<th style="width:52px">번호</th><th style="width:120px;text-align:left">학생</th><th style="width:54px">점수</th><th style="text-align:left">신호</th>' +
      '</tr></thead>' +
      res.tiers.map(t => {
        const list = t.rows.filter(r => shown.has(r));
        if (!list.length) return '';
        const next = res.tiers[res.tiers.indexOf(t) - 1];
        const hi = next ? next.min - 1 : null;
        const range = '점수 ' + t.min + (hi === null ? ' 이상' : hi > t.min ? '~' + hi : '');
        return '<tbody class="cr-tier" style="--tier:var(--' + CARE_TIER_TONE[t.key] + ')">' +
          '<tr class="cr-tier-h"><td colspan="4"><b>' + t.label + '</b><span class="n">' + list.length + '명</span>' +
          '<span class="hint">' + range + ' · ' + t.hint + '</span></td></tr>' +
          list.map(r => '<tr><td>' + careNoHtml(r.no) + '</td>' +
            '<td style="text-align:left">' + careNameBtn(r.name) + '</td>' +
            '<td><span class="cr-score">' + r.score + '</span></td>' +
            '<td style="text-align:left">' + r.flags.map(careFlagHtml).join('') + '</td></tr>').join('') +
          '</tbody>';
      }).join('') +
      '</table></div>';
  }

  if (res.calm.length) {
    html += '<div class="ns-sub-h">신호가 없는 학생 ' + res.calm.length + '명</div><div class="cr-calm">' +
      res.calm.map(n => {
        const no = typeof stuNoOf === 'function' ? stuNoOf(n) : '';
        return '<span class="cr-calm-i">' + (no ? '<span class="cr-no">' + mkEsc(no) + '</span>' : '') + careNameBtn(n, 'sm') + '</span>';
      }).join('') + '</div>';
  }

  const L = CE.LEVELS;
  html += '<div class="cr-foot"><b>세기 기준</b> (1 · 2 · 3) — ' +
    '내신 하락: 직전 학기 대비 학기 평균 ' + L.drop.join(' · ') + '등급 이상 · ' +
    '등급 경계: 최근 학기에 자기 등급 구간의 위쪽 ' + Math.round(CE.NEAR_POS * 100) + '% 안에 있는 과목 ' + L.near.join(' · ') + '개 이상 · ' +
    '내신·모의 격차: 9등급 기준 ' + L.gap.map(v => v.toFixed(1)).join(' · ') + '등급 이상 (방향 무관) · ' +
    '모의 하락: 직전 회차 대비 반영 과목 평균 ' + L.mockDrop.join(' · ') + '등급 이상.<br>' +
    '교과학습발달상황에는 석차가 없어 위치와 앞 인원은 <b>추정</b>입니다(「약」 표시). 추정이 기록된 등급과 어긋나는 과목은 등급 경계에서 뺐습니다. 일람표를 올리면 실제 석차로 계산합니다.</div>';
  html += '</div>';

  wrap.innerHTML = html;
}

/** 이름을 누르면 그 학생을 열고, 내신이 있으면 내신 탭으로 간다 (모의만 있으면 generateAll이 모의 탭으로 보낸다) */
function carePick(name) {
  const sel = document.getElementById('stu-sel');
  if (!sel || ![...sel.options].some(o => o.value === name)) return;
  sel.value = name;
  onStudentChange();
  if (typeof checkAll === 'function') checkAll(true);
  switchResultTab('naesin');
  generateAll();
  const rb = document.querySelector('.rbody');
  if (rb) rb.scrollTop = 0;
}

/** 시작 화면에서 바로 상담 우선순위를 연다 */
function careOpen() {
  if (!careAvailable()) { showToast('학생이 2명 이상 있는 성적 파일을 먼저 올려 주세요.'); return; }
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('result-area').style.display = 'block';
  switchResultTab('care');
  uiRefresh();
}

/** 아직 분석한 학생이 없으면 내신 탭은 빈 카드뿐이다 → 안내 한 줄만 보인다.
 *  (상담 우선순위나 모의고사만 먼저 열었을 때) */
function careMarkNaesin() {
  const tn = document.getElementById('tab-naesin');
  const sc = document.getElementById('summary-content');
  if (tn) tn.classList.toggle('ns-unbuilt', !currentStudent || !sc || !sc.innerHTML.trim());
}

/** 시작 화면 버튼·탭 배지를 데이터 상태에 맞춘다 (uiRefresh가 부른다) */
function careSync() {
  careMarkNaesin();
  const ok = careAvailable();
  const btn = document.getElementById('care-open');
  if (btn) btn.style.display = ok ? '' : 'none';
  // 버튼에 "몇 명을 볼지"를 미리 적어 둔다 — 누르기 전에 무게를 가늠하게
  const nEl = document.getElementById('care-open-n'), sub = document.getElementById('care-open-sub');
  if (ok && nEl) {
    let res = null;
    try { res = careResult(); } catch (e) { res = null; }
    nEl.textContent = res ? res.rows.length + '명' : '';
    nEl.style.display = res && res.rows.length ? '' : 'none';
    if (sub && res) sub.textContent = res.rows.length
      ? res.total + '명 중 ' + res.rows.length + '명에게 살펴볼 신호가 있습니다'
      : res.total + '명 모두 눈에 띄는 신호가 없습니다';
  }
  const tab = document.getElementById('rtab-care');
  if (tab) tab.disabled = !ok;
  if (typeof currentResultTab !== 'undefined' && currentResultTab === 'care') {
    const ra = document.getElementById('result-area');
    if (ra && ra.style.display !== 'none') renderCareTab();
  }
}

// ═══════════════════════════════════════════════
// 엑셀
// ═══════════════════════════════════════════════
async function careDownloadExcel() {
  if (!careAvailable()) { showToast('학생이 2명 이상이어야 합니다.'); return; }
  const res = careResult();
  const wb = new ExcelJS.Workbook();
  wb.creator = '고교 성적 나침반 5.0';
  const ws = wb.addWorksheet('상담 우선순위');
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const W = [12, 7, 12, 7].concat(CE.KINDS.map(() => 38));
  W.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const N = W.length;

  ws.mergeCells(1, 1, 1, N);
  mkCell(ws, 1, 1, '상담 우선순위 — ' + res.total + '명 중 ' + res.rows.length + '명',
    { font: { bold: true, size: 15, color: { argb: MK_PURPLE } }, fill: 'FFF5F3FF' });
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, N);
  mkCell(ws, 2, 1, '점수 = 신호별 세기(1~3)의 합. 묶음: ' + CE.TIERS.map(t => t.label + ' ' + t.min + '점 이상').join(' · ') +
    '. 상담 순서를 정하는 용도이며 학생 평가가 아닙니다. 출력일 ' + _todayStr(),
    { font: { size: 9, color: { argb: 'FF6B7280' } }, align: { horizontal: 'left' } });

  let r = 4;
  ['구분', '번호', '학생', '점수'].concat(CE.KINDS.map(k => k.label)).forEach((h, i) =>
    mkCell(ws, r, i + 1, h, { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: MK_TEAL }));
  r++;
  const tierLabel = k => (CE.TIERS.filter(t => t.key === k)[0] || {}).label || '';
  res.rows.forEach(row => {
    const no = String(row.no || '');
    mkCell(ws, r, 1, tierLabel(row.tier), { font: { bold: true, size: 10 } });
    mkCell(ws, r, 2, /^\d+$/.test(no) ? +no : no, { font: { size: 10 } });
    mkCell(ws, r, 3, row.name, { font: { bold: true, size: 10 } });
    mkCell(ws, r, 4, row.score, { font: { bold: true, size: 10, color: { argb: MK_PURPLE } } });
    let lines = 1;
    CE.KINDS.forEach((k, i) => {
      const f = row.flags.filter(x => x.kind === k.key)[0];
      const text = f ? '[' + f.level + '] ' + CE.describe(f) : '';
      mkCell(ws, r, 5 + i, text,
        { font: { size: 10 }, align: { horizontal: 'left', vertical: 'top' }, wrap: true, fill: f ? (f.level >= 3 ? 'FFFFE4E6' : f.level === 2 ? 'FFFEF3C7' : null) : null });
      // 한글 한 글자 ≈ 열 너비 1.9칸 (맑은 고딕 10pt)
      lines = Math.max(lines, Math.ceil(text.length * 1.9 / (W[4 + i] - 1)));
    });
    ws.getRow(r).height = Math.max(20, lines * 15 + 5);
    ['1', '2', '3', '4'].forEach(c => { ws.getCell(r, +c).alignment = Object.assign({}, ws.getCell(r, +c).alignment, { vertical: 'top' }); });
    r++;
  });
  if (res.calm.length) {
    r++;
    ws.mergeCells(r, 1, r, N);
    mkCell(ws, r, 1, '신호가 없는 학생 ' + res.calm.length + '명: ' +
      res.calm.map(n => { const no = typeof stuNoOf === 'function' ? stuNoOf(n) : ''; return (no ? no + '번 ' : '') + n; }).join(', '),
      { font: { size: 9, color: { argb: 'FF6B7280' } }, align: { horizontal: 'left' }, wrap: true });
  }
  const d = new Date(), z = v => String(v).padStart(2, '0');
  await mkSaveWb(wb, '상담우선순위_' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '.xlsx');
  showToast('엑셀을 저장했습니다.');
}

/* ══════════════ ui/shell.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   화면 껍데기 (shell.js)
   ───────────────────────────────────────────────────────────────
   · 아이콘 주입   — 마크업의 <i data-ic="…">를 SVG로 바꾼다
   · 오프닝       — 페이지를 열거나 새로고침할 때마다 재생
   · 자료 패널    — 접기/펴기, 레일 버튼
   · 사용법 모달  — 탭 전환
   · 밝기         — 시스템 설정을 따르되 사용자가 고르면 기억

   이 파일은 본문 스크립트보다 뒤에 붙는다. 같은 이름의 함수를
   다시 선언해 기존 동작(이모지 표기 등)을 덮어쓰는 곳이 몇 군데 있다.
   ═══════════════════════════════════════════════════════════════ */

// ── 아이콘 주입 ────────────────────────────────────────────────
function hydrateIcons(root) {
  const scope = root || document;
  scope.querySelectorAll('i[data-ic]').forEach(el => {
    const name = el.getAttribute('data-ic');
    const size = parseInt(el.getAttribute('data-s'), 10) || 16;
    const svg = ic(name, size, el.className || null);
    if (!svg) return;
    const tmp = document.createElement('span');
    tmp.innerHTML = svg;
    const node = tmp.firstChild;
    if (el.className) node.setAttribute('class', 'ic ' + el.className);
    el.replaceWith(node);
  });
}

// ── 오프닝 ────────────────────────────────────────────────────
// 캔버스 한 장 + 시간축 하나(약 3.8초). 장면은 전부 같은 draw(t)가 그린다.
//   0.00 모눈 눈금이 가운데서 양옆으로 그어진다
//   0.15 학생 점 24개가 화면 밖에서 잔상을 끌며 날아와 산점도에 앉는다
//   0.45 내신·모의 두 곡선이 그려지고 끝에서 등급이 카운트된다
//   0.95 돋보기가 모의 곡선을 타고 지나간다 — 렌즈 안은 실제로 확대되고,
//        지나간 자리는 흐린 회색에서 성향 색(수시·균형·정시)으로 현상된다
//   2.00 장면 전체가 소용돌이치며 렌즈 속으로 빨려 들어가고, 렌즈는 로고 자리로 간다
//   2.35 「성적 돋보기」가 한 자씩 또렷해지고, 태그라인이 타이핑된다
//   3.25 렌즈 중심에서 원이 열리며 실제 화면이 드러난다
let introDone = false, introRaf = 0, introFx = null;
function introCancel() { if (introRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(introRaf); }

function introSkip() {
  if (introDone) return;
  introDone = true;
  introCancel();
  const el = document.getElementById('intro');
  if (!el) return;
  el.style.webkitMaskImage = el.style.maskImage = '';
  el.classList.add('skip');
  setTimeout(() => el.remove(), 260);
}

function introEnd() {
  if (introDone) return;
  introDone = true;
  introCancel();
  const el = document.getElementById('intro');
  if (el) el.remove();
}

function introInit() {
  const el = document.getElementById('intro');
  if (!el) return;
  // 오프닝이 어떤 이유로든 실패해도 앱은 떠야 한다 — 실패하면 조용히 걷어낸다
  try {
    el.remove();
    introDone = true;
    return;
  } catch (e) {
    introDone = true;
    introCancel();
    if (el.parentNode && el.remove) el.remove();
  }
}

function introRun(el) {
  // 새로고침할 때마다 재생한다. 운영체제에서 '애니메이션 줄이기'를 켠 사람만 건너뛴다.
  const cv = document.getElementById('introFx');
  if (!cv || !cv.getContext || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.remove();
    introDone = true;
    return;
  }
  window.addEventListener('keydown', introSkip, { once: true });

  const ctx = cv.getContext('2d');
  const word = document.getElementById('introWord');
  const tag = document.getElementById('introTag');
  const slot = document.getElementById('introSlot');

  // 글자를 한 자씩 쪼갠다 (공백은 폭만 남긴다)
  const chars = [];
  if (word) {
    const txt = word.textContent;
    word.textContent = '';
    for (const c of txt) {
      const sp = document.createElement('span');
      sp.className = 'ch';
      sp.textContent = c === ' ' ? ' ' : c;
      word.appendChild(sp);
      chars.push(sp);
    }
  }
  const tagText = tag ? (tag.dataset.text || '') : '';

  // ── 색: 테마 토큰을 읽는다 (흰 종이 / 크림 종이 모두) ──
  const css = n => getComputedStyle(document.body).getPropertyValue(n).trim();
  const TR = (window.MockEngine && window.MockEngine.TRACK) || {};
  const C = {
    paper: css('--paper') || '#ffffff', ink3: css('--ink-3') || '#8b959f',
    accent: css('--accent') || '#18181b', good: css('--good') || '#0a7550',
    susi: (TR.SUSI && TR.SUSI.color) || '#0a7550', bal: (TR.BALANCE && TR.BALANCE.color) || '#9a5b08',
    jeong: (TR.JEONGSI && TR.JEONGSI.color) || '#6b4bb0'
  };
  const rgba = (hex, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  const FONT = '"Pretendard Variable",Pretendard,"Malgun Gothic",sans-serif';
  const DFONT = '"Gothic A1","Pretendard Variable","Malgun Gothic",sans-serif';

  // ── 수학 ──
  const cl = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const seg = (t, a, b) => cl((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const eOut = k => 1 - Math.pow(1 - k, 3);
  const eIn = k => k * k * k;
  const eIO = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const eBack = k => { const c = 1.55, c3 = c + 1; return 1 + c3 * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ── 데이터: 반 24명 (성향 지도와 같은 뜻 — 대각선 위 정시, 아래 수시, 가운데 균형) ──
  const dots = [];
  for (let i = 0; i < 24; i++) {
    const u = .06 + rnd() * .88;
    const v = cl(1 - u + (rnd() - .5) * .62);
    const d = (1 - v) - u;                      // + 이면 모의가 앞섬
    dots.push({
      u: u, v: .08 + v * .84, col: Math.abs(d) < .1 ? C.bal : (d > 0 ? C.jeong : C.susi),
      ang: rnd() * Math.PI * 2, far: .75 + rnd() * .5, t0: 150 + i * 30 + rnd() * 60, spin: (rnd() - .5) * 2, tr: 0
    });
  }
  // 학기·회차 흐름 (값이 작을수록 위 = 좋은 등급). 내신은 완만하게, 모의는 크게 오른다
  const NAE = [.58, .52, .56, .44, .42, .36, .30];
  const MOK = [.82, .74, .76, .58, .52, .40, .26];

  // ── 렌즈 경로 시각 ──
  const SWEEP_A = 950, SWEEP_B = 2000, LAND_B = 2600, DUR = 3800;

  // ── 배치 (창 크기에 맞춤) ──
  let vw = 0, vh = 0, dpr = 1, L = null;
  function layout() {
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    const W = Math.min(780, vw * .74), H = Math.min(W * .48, vh * .46);
    const x0 = (vw - W) / 2, y0 = vh / 2 - H / 2 - 30;
    const R = Math.max(42, Math.min(66, W * .085));
    // 렌즈가 내려앉을 자리 = 글자 왼쪽 로고 칸
    const lensBox = Math.max(50, Math.min(88, vw * .13));
    el.style.setProperty('--lens', lensBox + 'px');
    const r = slot ? slot.getBoundingClientRect() : { left: vw / 2 - 140, top: vh / 2 - lensBox / 2, width: lensBox, height: lensBox };
    // 로고 칸 안에서 렌즈+손잡이가 들어가도록 테 반지름을 잡고, 중심을 왼쪽 위로 당긴다
    const fr = lensBox / 2 / 1.32;
    const wr = word ? word.getBoundingClientRect() : { left: vw / 2, right: vw / 2, bottom: vh / 2 };
    L = { W: W, H: H, x0: x0, y0: y0, R: R, fr: fr,
          fx: r.left + r.width / 2 - fr * .3, fy: r.top + r.height / 2 - fr * .3,
          wl: wr.left, wr: wr.right, wb: wr.bottom };
    // 각 점을 렌즈가 지나는 시각 (점이 '현상'되는 순간)
    for (const d of dots) {
      const x = x0 + d.u * W;
      let tt = SWEEP_A;
      while (tt < SWEEP_B && lensAt(tt).x < x) tt += 8;
      d.tr = tt;
    }
  }

  // 곡선 위의 점 (Catmull-Rom). k: 0~1
  function curvePt(arr, k) {
    const n = arr.length - 1, f = cl(k) * n, i = Math.min(n - 1, Math.floor(f)), s = f - i;
    const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n, i + 2)];
    const v = .5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s * s * s);
    return { x: L.x0 + cl(k) * L.W, y: L.y0 + v * L.H };
  }

  function lensAt(t) {
    if (t < SWEEP_B) {
      // 왼쪽 밖에서 들어와 모의 곡선을 타고 오른쪽 끝까지
      const k = eIO(seg(t, SWEEP_A, SWEEP_B));
      const u = lerp(-.14, 1.0, k);
      const p = curvePt(MOK, u);
      return { x: L.x0 + u * L.W, y: p.y - L.R * .15, r: L.R, m: 1.85, show: seg(t, SWEEP_A, SWEEP_A + 160) };
    }
    // 오른쪽 끝에서 위로 크게 돌아 로고 자리로 내려앉는다
    const k = eIO(seg(t, SWEEP_B, LAND_B));
    const s = lensAt(SWEEP_B - .01);
    return {
      x: lerp(s.x, L.fx, k), y: lerp(s.y, L.fy, k) - Math.sin(k * Math.PI) * L.H * .55,
      r: lerp(L.R, L.fr, k), m: lerp(1.85, 1, k), show: 1
    };
  }

  // ── 장면 ──
  // colored=false : 흐린 회색 판 / true : 렌즈가 지나간 뒤의 선명한 판
  function scene(t, colored) {
    const W = L.W, H = L.H, x0 = L.x0, y0 = L.y0;
    // 모눈: 등급 9줄이 가운데서 양옆으로
    ctx.lineWidth = 1;
    for (let g = 0; g < 9; g++) {
      const k = eOut(seg(t, g * 32, 520 + g * 32));
      if (!k) continue;
      const y = Math.round(y0 + g / 8 * H) + .5, half = W / 2 * k;
      ctx.strokeStyle = colored ? rgba(C.accent, g === 0 ? .25 : .1) : rgba(C.ink3, g === 0 ? .5 : .3);
      ctx.beginPath(); ctx.moveTo(x0 + W / 2 - half, y); ctx.lineTo(x0 + W / 2 + half, y); ctx.stroke();
      const a = seg(t, 300 + g * 40, 560 + g * 40);
      if (a) {
        ctx.fillStyle = rgba(colored ? C.accent : C.ink3, .75 * a);
        ctx.font = '700 10px ' + FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(String(g + 1), x0 - 10, y);
      }
    }
    for (let c = 0; c <= 6; c++) {
      const k = eOut(seg(t, 200 + c * 40, 700 + c * 40));
      if (!k) continue;
      const x = Math.round(x0 + c / 6 * W) + .5;
      ctx.strokeStyle = colored ? rgba(C.accent, .07) : rgba(C.ink3, .18);
      ctx.beginPath(); ctx.moveTo(x, y0 + H / 2 - H / 2 * k); ctx.lineTo(x, y0 + H / 2 + H / 2 * k); ctx.stroke();
    }
    // 정시/수시를 가르는 대각선
    const dk = eOut(seg(t, 600, 1100));
    if (dk) {
      ctx.save(); ctx.setLineDash([5, 5]);
      ctx.strokeStyle = rgba(C.ink3, colored ? .55 : .3);
      ctx.beginPath(); ctx.moveTo(x0, y0 + H); ctx.lineTo(x0 + W * dk, y0 + H - H * dk); ctx.stroke();
      ctx.restore();
    }

    // 곡선 두 줄
    const ck = eIO(seg(t, 450, 1450));
    if (ck > 0) {
      const lines = [[NAE, colored ? C.good : rgba(C.ink3, .45), 2.6, C.good], [MOK, colored ? C.accent : rgba(C.ink3, .6), 3.2, C.accent]];
      for (const [arr, col, w, hue] of lines) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        const N = 90;
        for (let i = 0; i <= N * ck; i++) { const p = curvePt(arr, i / N); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
        const hd = curvePt(arr, ck); ctx.lineTo(hd.x, hd.y);
        ctx.stroke();
        // 머리: 점 + 퍼지는 고리
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(hd.x, hd.y, w + 1.6, 0, Math.PI * 2); ctx.fill();
        if (ck < 1) {
          const pr = (t % 420) / 420;
          ctx.strokeStyle = colored ? rgba(hue, .5 * (1 - pr)) : rgba(C.ink3, .35 * (1 - pr));
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(hd.x, hd.y, w + 2 + pr * 12, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // 곡선 끝에서 등급이 카운트된다
      const nk = seg(t, 900, 1500);
      if (nk) {
        const labels = [[NAE, '내신', colored ? C.good : C.ink3, 5.9, 2.31, 12], [MOK, '모의', colored ? C.accent : C.ink3, 7.6, 1.64, -4]];
        ctx.globalAlpha = eOut(nk);
        for (const [arr, lb, col, from, to, dy] of labels) {
          const p = curvePt(arr, ck);
          const val = lerp(from, to, eOut(seg(t, 900, 1700)));
          ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.font = '800 11px ' + FONT;
          ctx.fillText(lb, p.x + 14, p.y + dy);
          ctx.font = '900 15px ' + DFONT;
          ctx.fillText(val.toFixed(2), p.x + 42, p.y + dy);
        }
        ctx.globalAlpha = 1;
      }
    }

    // 학생 점: 날아와 앉는다
    for (const d of dots) {
      const k = seg(t, d.t0, d.t0 + 720);
      if (!k) continue;
      const tx = x0 + d.u * W, ty = y0 + d.v * H;
      const far = Math.max(vw, vh) * d.far;
      const sx = vw / 2 + Math.cos(d.ang) * far, sy = vh / 2 + Math.sin(d.ang) * far;
      const pos = kk => {
        const e = eBack(kk), sw = (1 - eOut(kk)) * d.spin * 1.4;   // 살짝 휘어 들어온다
        return {
          x: lerp(sx, tx, e) + Math.cos(d.ang + Math.PI / 2) * sw * 60,
          y: lerp(sy, ty, e) + Math.sin(d.ang + Math.PI / 2) * sw * 60
        };
      };
      const p = pos(k);
      // 잔상
      if (k < 1) {
        const q = pos(Math.max(0, k - .09));
        const g = ctx.createLinearGradient(q.x, q.y, p.x, p.y);
        g.addColorStop(0, rgba(colored ? d.col : C.ink3, 0));
        g.addColorStop(1, rgba(colored ? d.col : C.ink3, .55));
        ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      let r = 4.2;
      if (colored && d.tr) {
        // 렌즈가 지나간 순간 톡 튀었다 가라앉는다 + 1px 방사선
        const since = t - d.tr;
        if (since > 0 && since < 520) {
          const b = since / 520;
          r *= 1 + .9 * Math.exp(-b * 5) * Math.sin(b * Math.PI);
          ctx.strokeStyle = rgba(d.col, .7 * (1 - b)); ctx.lineWidth = 1;
          for (let s = 0; s < 6; s++) {
            const an = s / 6 * Math.PI * 2 + d.ang;
            const r1 = 7 + b * 6, r2 = 10 + b * 14;
            ctx.beginPath(); ctx.moveTo(p.x + Math.cos(an) * r1, p.y + Math.sin(an) * r1);
            ctx.lineTo(p.x + Math.cos(an) * r2, p.y + Math.sin(an) * r2); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = colored ? d.col : rgba(C.ink3, .75);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      if (colored) { ctx.strokeStyle = C.paper; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
  }

  // 돋보기 (로고와 같은 비례: 테 r, 손잡이 45°)
  function drawLens(lx, ly, R, alpha, logoK) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = C.accent; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2.4, R * .2);
    ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.stroke();
    // 유리 반사광
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1.2, R * .06);
    ctx.beginPath(); ctx.arc(lx, ly, R * .72, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
    // 손잡이
    const h1 = R * 1.04, h2 = R * 1.86, c45 = Math.SQRT1_2;
    ctx.strokeStyle = C.accent; ctx.lineWidth = Math.max(4, R * .25);
    ctx.beginPath(); ctx.moveTo(lx + h1 * c45, ly + h1 * c45); ctx.lineTo(lx + h2 * c45, ly + h2 * c45); ctx.stroke();
    // 로고의 상승 곡선 (렌즈가 내려앉은 뒤 그려진다 — 헤더 로고와 같은 모양)
    if (logoK > 0) {
      const S = R / 10.4;
      const P = [[9, 16.6], [12.2, 12.7], [14.9, 15.1], [18.5, 9.8]].map(q => [lx + (q[0] - 14) * S, ly + (q[1] - 14) * S]);
      ctx.strokeStyle = rgba(C.accent, .7); ctx.lineWidth = Math.max(1.6, R * .18); ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(P[0][0], P[0][1]);
      const tot = logoK * 3;
      for (let i = 1; i <= 3; i++) {
        const f = cl(tot - (i - 1));
        if (!f) break;
        ctx.lineTo(lerp(P[i - 1][0], P[i][0], f), lerp(P[i - 1][1], P[i][1], f));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 장면을 렌즈 중심으로 소용돌이치며 빨아들이는 변환
  function swirl(lens, sk) {
    if (sk <= 0) return;
    ctx.translate(lens.x, lens.y);
    ctx.rotate(-sk * .55);
    ctx.scale(1 - sk, 1 - sk);
    ctx.translate(-lens.x, -lens.y);
  }

  function draw(t) {
    if (!L) layout();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    const lens = lensAt(t);
    const sk = eIn(seg(t, 2000, 2560));          // 빨려 들어가는 정도

    // 흐린 판 → 렌즈가 지나간 왼쪽만 선명한 판
    ctx.save();
    swirl(lens, sk);
    if (sk > 0) ctx.globalAlpha = 1 - sk * .6;
    const reveal = t < SWEEP_A ? -1 : (t < SWEEP_B ? lens.x : 1e5);
    if (reveal < L.x0 + L.W + 40) scene(t, false);
    if (reveal > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-1e4, -1e4, reveal + 1e4, 3e4); ctx.clip();
      if (reveal < 1e5) { ctx.fillStyle = C.paper; ctx.fillRect(-1e4, -1e4, reveal + 1e4, 3e4); }
      scene(t, true);
      ctx.restore();
    }
    ctx.restore();

    // 렌즈 안: 실제로 확대해서 다시 그린다
    if (lens.show > 0) {
      if (t < 2560) {
        ctx.save();
        ctx.beginPath(); ctx.arc(lens.x, lens.y, lens.r - 1, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = C.paper; ctx.fillRect(lens.x - lens.r, lens.y - lens.r, lens.r * 2, lens.r * 2);
        ctx.translate(lens.x, lens.y); ctx.scale(lens.m, lens.m); ctx.translate(-lens.x, -lens.y);
        swirl(lens, sk);
        ctx.globalAlpha = lens.show * (1 - sk * .6);
        scene(t, true);
        ctx.restore();
        // 렌즈 가장자리 옅은 띠 (유리 두께)
        ctx.strokeStyle = rgba(C.accent, .12 * lens.show); ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(lens.x, lens.y, lens.r - 4, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = C.paper;
        ctx.beginPath(); ctx.arc(lens.x, lens.y, lens.r, 0, Math.PI * 2); ctx.fill();
      }
      drawLens(lens.x, lens.y, lens.r, lens.show, eOut(seg(t, 2500, 2900)));
    }

    // 착지 잔물결 (1px 고리 두 겹)
    for (const [d0, k0] of [[2520, 1], [2640, .6]]) {
      const rk = seg(t, d0, d0 + 700);
      if (rk > 0 && rk < 1) {
        ctx.strokeStyle = rgba(C.accent, .45 * k0 * (1 - rk)); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(L.fx, L.fy, L.fr * (1.2 + eOut(rk) * 2.6), 0, Math.PI * 2); ctx.stroke();
      }
    }

    // 착지 순간 반 24명이 성향 색으로 렌즈에서 터져 나간다
    const bk = seg(t, 2540, 3250);
    if (bk > 0 && bk < 1) {
      dots.forEach((d, i) => {
        const an = i / dots.length * Math.PI * 2 + d.spin * .4;
        const e = eOut(seg(t, 2540 + (i % 4) * 22, 3250));
        const dist = L.fr * 1.3 + e * (80 + (i % 3) * 46);
        const x = L.fx + Math.cos(an) * dist, y = L.fy + Math.sin(an) * dist;
        const tail = Math.max(0, dist - 26 * (1 - e));
        ctx.strokeStyle = rgba(d.col, .5 * (1 - bk)); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(L.fx + Math.cos(an) * tail, L.fy + Math.sin(an) * tail); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = rgba(d.col, 1 - bk);
        ctx.beginPath(); ctx.arc(x, y, 3.4 * (1 - bk * .5), 0, Math.PI * 2); ctx.fill();
      });
    }
    // 유리 위를 스치는 빛
    const gk = seg(t, 2640, 3000);
    if (gk > 0 && gk < 1) {
      ctx.save();
      ctx.beginPath(); ctx.arc(L.fx, L.fy, L.fr - 1, 0, Math.PI * 2); ctx.clip();
      const gx = L.fx - L.fr * 1.6 + eIO(gk) * L.fr * 3.2;
      const gr = ctx.createLinearGradient(gx - 14, 0, gx + 14, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.translate(L.fx, L.fy); ctx.rotate(-.6); ctx.translate(-L.fx, -L.fy);
      ctx.fillStyle = gr; ctx.fillRect(gx - 14, L.fy - L.fr * 2, 28, L.fr * 4);
      ctx.restore();
    }
    // 글자 밑으로 그어지는 축선 (끝에 점)
    const uk = eOut(seg(t, 2820, 3200));
    if (uk > 0) {
      const ux = L.wl + 2, uy = L.wb + 8, ue = lerp(ux, L.wr, uk);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(ue, uy); ctx.stroke();
      ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(ue, uy, 3.6, 0, Math.PI * 2); ctx.fill();
    }

    // 글자: 흐림에서 또렷하게, 한 자씩 올라온다
    chars.forEach((sp, i) => {
      const k = seg(t, 2350 + i * 60, 2350 + i * 60 + 560);
      const e = eBack(k);
      sp.style.opacity = String(cl(k * 1.6));
      sp.style.transform = 'translateY(' + ((1 - e) * 26).toFixed(2) + 'px) scale(' + (.86 + .14 * e).toFixed(3) + ')';
      sp.style.filter = k < 1 ? 'blur(' + ((1 - eOut(k)) * 7).toFixed(2) + 'px)' : 'none';
    });
    // 태그라인 타이핑
    if (tag) {
      const n = Math.floor(seg(t, 2720, 3220) * tagText.length);
      const caret = t > 2700 && n < tagText.length;
      const key = n + (caret ? 'c' : '');
      if (tag._k !== key) {
        tag._k = key;
        tag.textContent = tagText.slice(0, n);
        if (caret) { const c = document.createElement('span'); c.className = 'caret'; tag.appendChild(c); }
      }
    }

    // 3.25초~: 렌즈 중심에서 원이 열리며 실제 화면이 드러난다
    const ik = seg(t, 3250, DUR);
    if (ik > 0) {
      const rr = eIn(ik) * Math.hypot(vw, vh) * 1.05;
      const m = 'radial-gradient(circle at ' + L.fx.toFixed(1) + 'px ' + L.fy.toFixed(1) + 'px, transparent ' +
        rr.toFixed(1) + 'px, #000 ' + (rr + 1.5).toFixed(1) + 'px)';
      el.style.webkitMaskImage = m; el.style.maskImage = m;
      ctx.strokeStyle = rgba(C.accent, .9 * (1 - ik)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(L.fx, L.fy, rr + 2.5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  introFx = { draw: draw, layout: layout, DUR: DUR };
  window.addEventListener('resize', () => { if (!introDone) layout(); });
  layout();

  let start = 0;
  const frame = now => {
    if (introDone) return;
    if (!start) start = now;
    const t = now - start;
    draw(t);
    if (t >= DUR) { introEnd(); return; }
    introRaf = requestAnimationFrame(frame);
  };
  introRaf = requestAnimationFrame(frame);
}

// ── 자료 패널 접기/펴기 ────────────────────────────────────────
let railManual = false;   // 사용자가 직접 건드렸는가
function toggleRail() {
  railManual = true;
  document.body.classList.toggle('rail');
}
function setRail(on) {
  if (railManual) return;           // 손댄 뒤로는 자동으로 움직이지 않는다
  document.body.classList.toggle('rail', !!on);
}
/** 레일 아이콘 → 패널을 펴고 해당 섹션만 연다 */
function openSection(id) {
  document.body.classList.remove('rail');
  railManual = true;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('collapsed');
  setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
}

// ── 학생 번호 ───────────────────────────────────────────────
// 내신 파서는 이름만 키로 남긴다. 번호는 원본 시트에서 따로 읽어 둔다:
// 나이스 파일·일람표 모두 「번호 | 성명」이 붙어 있으므로, 학생 이름 칸의 왼쪽 첫 값이 숫자면 그게 번호다.
// 저장분을 불러올 때는 원본 시트가 없으므로 mock-store가 stuNos를 함께 저장·복원한다.
let stuNos = {};

function stuNoScan() {
  const out = {};
  Object.values(lastSheetRows || {}).forEach(rows => (rows || []).forEach(row => {
    if (!row) return;
    for (let c = 1; c < row.length; c++) {
      const nm = String(row[c] == null ? '' : row[c]).trim();
      if (!nm || !allStudents[nm] || out[nm] !== undefined) continue;
      for (let k = c - 1; k >= Math.max(0, c - 3); k--) {   // 병합 칸으로 한두 칸 떨어져 있을 수 있다
        const v = String(row[k] == null ? '' : row[k]).trim();
        if (v === '') continue;
        if (/^\d{1,3}$/.test(v) && +v >= 1 && +v <= 200) out[nm] = +v;
        break;
      }
    }
  }));
  return out;
}

/** 새 파일을 읽었을 때만 다시 잡는다 (저장분 복원 중에는 시트가 비어 있다) */
function stuNoCapture() {
  if (!Object.keys(lastSheetRows || {}).length) return;
  // 내신을 합쳤으면(nsMergeInfo) 앞 파일에서 읽은 번호도 남긴다
  const merged = typeof nsMergeInfo !== 'undefined' && nsMergeInfo;
  stuNos = merged ? Object.assign({}, stuNos, stuNoScan()) : stuNoScan();
}

/** 번호 — 내신 파일 우선, 없으면 모의고사 명단의 번호. 모의 명단이 여러 반이면 반도 붙인다. */
function stuNoOf(name) {
  if (stuNos[name] !== undefined) return String(stuNos[name]);
  const stu = (typeof mockStudents !== 'undefined' && mockStudents) ? mockStudents[name] : null;
  const m = stu && stu.meta;
  if (!m || m.num === null || m.num === undefined || m.num === '') return '';
  return (stuNoMultiClass() && m.cls ? m.cls + '-' : '') + m.num;
}
function stuNoMultiClass() {
  if (typeof mockStudents === 'undefined' || !mockStudents) return false;
  const s = new Set();
  Object.values(mockStudents).forEach(x => { if (x && x.meta && x.meta.cls) s.add(String(x.meta.cls)); });
  return s.size > 1;
}
/** 번호 순 비교 (번호가 없으면 뒤로, 그다음 이름) */
function stuNoCompare(a, b) {
  const na = parseFloat(String(stuNoOf(a)).split('-').pop()), nb = parseFloat(String(stuNoOf(b)).split('-').pop());
  const fa = isFinite(na), fb = isFinite(nb);
  if (fa && fb && na !== nb) return na - nb;
  if (fa !== fb) return fa ? -1 : 1;
  return a.localeCompare(b, 'ko');
}

/** 학생 선택 목록에 「12번 김민수」처럼 번호를 붙인다. 값(value)은 이름 그대로라 다른 코드는 영향이 없다. */
function stuNoLabelSelect() {
  const sel = document.getElementById('stu-sel');
  if (!sel) return;
  [...sel.options].forEach(o => {
    if (!o.value) return;
    const no = stuNoOf(o.value);
    const mockOnly = !allStudents[o.value];
    o.textContent = (no ? no + '번 ' : '') + o.value + (mockOnly ? ' (모의)' : '');
  });
}

// ── 결과 유무에 따라 상단 바 조정 ──────────────────────────────
function uiRefresh() {
  const ra = document.getElementById('result-area');
  const has = !!ra && ra.style.display !== 'none';
  document.body.classList.toggle('has-result', has);

  // 내신 파일을 새로 올리면 학생 목록을 통째로 다시 그린다.
  // 그때 모의고사만 올린 학생이 목록과 일괄 처리에서 빠지지 않게 여기서 다시 채운다.
  if (typeof mkSyncStudentSelect === 'function') {
    try { mkSyncStudentSelect(); } catch (e) {}
  }
  try { stuNoLabelSelect(); } catch (e) {}
  if (typeof mkBatchNames === 'function') {
    const bc = document.getElementById('batch-count');
    if (bc) bc.textContent = mkBatchNames().length + '명';
  }
  // 상담 우선순위 — 시작 화면 버튼·탭 사용 가능 여부
  if (typeof careSync === 'function') {
    try { careSync(); } catch (e) { console.error('[상담 우선순위]', e); }
  }
  // 저장 상태를 레일 점으로도 표시
  const dot = document.getElementById('rail-store');
  if (dot) {
    const info = (typeof mkStoreInfo === 'function') ? mkStoreInfo() : { ok: false };
    dot.querySelector('.dot')?.remove();
    if (info.ok) {
      const d = document.createElement('span');
      d.className = 'dot';
      dot.appendChild(d);
    }
  }
}

// ── 사용법 모달 ───────────────────────────────────────────────
function gdTab(i) {
  document.querySelectorAll('.gd-tab').forEach((b, n) => b.classList.toggle('active', n === i));
  document.querySelectorAll('.gd-pane').forEach((p, n) => p.classList.toggle('on', n === i));
  const bd = document.querySelector('#guide-modal .modal-bd');
  if (bd) bd.scrollTop = 0;
  const md = document.querySelector('#guide-modal .modal');
  if (md) md.scrollTop = 0;
}

// 기존 정의를 덮어쓴다 (스크롤 위치 초기화 + ESC 닫기)
function openGuide() {
  document.getElementById('guide-modal').classList.add('open');
  gdTab(0);
}
function closeGuide() {
  document.getElementById('guide-modal').classList.remove('open');
}

// 성적통지표 PDF 예시 — 사용법 위에도 뜨도록 따로 둔다
function openMkSample() {
  const m = document.getElementById('mk-sample-modal');
  m.querySelector('.mk-sample-fig').classList.remove('zoom');
  m.classList.add('open');
}
function closeMkSample() {
  document.getElementById('mk-sample-modal').classList.remove('open');
}

// ── 화면 톤 (흰 종이 ↔ 크림 종이) ──────────────────────────────
//    어두운 테마는 쓰지 않는다. 오래 보는 업무 화면이라 눈이 편한 쪽이 낫다.
function applyWarm(on) {
  document.body.classList.toggle('warm', !!on);
  const btn = document.getElementById('dark-btn');
  if (btn) {
    // 어두운 테마가 아니라 '종이 색'을 고르는 것이라 해·달 아이콘은 쓰지 않는다
    btn.innerHTML = ic('tone', 16);
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? '지금은 크림 종이 · 누르면 흰 종이' : '지금은 흰 종이 · 누르면 크림 종이 (눈이 편합니다)';
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', on ? '#fbf7f0' : '#ffffff');
}
function toggleDark() {          // 헤더 버튼이 부르는 이름은 그대로 둔다
  const on = !document.body.classList.contains('warm');
  applyWarm(on);
  try { localStorage.setItem('gd.warm', on ? '1' : '0'); } catch (e) {}
}
function darkInit() {
  let saved = null;
  try { saved = localStorage.getItem('gd.warm'); } catch (e) {}
  applyWarm(saved === '1');      // 기본은 흰 바탕
}

// ── 전역 키 ───────────────────────────────────────────────────
function shellKeys(e) {
  if (e.key === 'Escape') {
    const sm = document.getElementById('mk-sample-modal');
    if (sm && sm.classList.contains('open')) { closeMkSample(); return; }   // 예시만 먼저 닫는다
    closeGuide();
    const mb = document.getElementById('mapper-bg');
    if (mb && mb.classList.contains('open')) closeMapper();
  }
}

// ── 시작 ──────────────────────────────────────────────────────
function shellInit() {
  hydrateIcons();
  const bm = document.getElementById('brand-mark');
  if (bm) bm.innerHTML = logoMark(28);
  darkInit();
  introInit();
  document.addEventListener('keydown', shellKeys);
  uiRefresh();
}

/* ══════════════ ui/output.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   탭별 출력 (output.js)
   ───────────────────────────────────────────────────────────────
   상단 바의 인쇄 · 엑셀 · 프롬프트 버튼은 지금 보고 있는 탭의 내용을 낸다.

     내신 탭    인쇄(내신 화면) · 엑셀(과목별 분석) · 프롬프트(내신 중심)
     모의고사   인쇄(모의 화면) · 엑셀(회차별 성적) · 프롬프트(모의 중심)
     통합       인쇄(판정 화면) · 엑셀(수시/정시 요약)   ← 프롬프트 없음
     상담 우선순위  엑셀(학급 순서표)                 ← 인쇄·프롬프트 없음, 학생 선택 불필요

   인쇄는 화면에 열려 있는 탭이 그대로 찍힌다(@media print에서 탭 바만 감춘다).
   ═══════════════════════════════════════════════════════════════ */

function outGuard() {
  if (!currentStudent && currentResultTab !== 'mock' && currentResultTab !== 'care') {
    showToast('학생을 먼저 선택해 주세요.');
    return false;
  }
  const ra = document.getElementById('result-area');
  if (!ra || ra.style.display === 'none') {
    showToast('먼저 [분석]을 눌러 주세요.');
    return false;
  }
  return true;
}

// ── 인쇄 ──────────────────────────────────────────────────────
function outPrint() {
  if (!outGuard()) return;
  if (typeof _jobGuard === 'function' && !_jobGuard()) return;

  const tab = currentResultTab;
  // 수시·정시 판정은 교사가 화면으로 보고 상담에 쓰는 자료다.
  // 인쇄해서 학생에게 건네면 '정시 우위'만 보고 내신을 놓을 수 있어 인쇄를 막는다.
  if (tab === 'fusion') {
    showToast('수시·정시 판정은 상담용이라 인쇄하지 않습니다. 내신·모의고사 탭에서 인쇄하세요.');
    return;
  }
  // 상담 우선순위는 반 학생 이름이 나란히 나오는 교사용 화면이다
  if (tab === 'care') {
    showToast('상담 우선순위는 인쇄하지 않습니다. 필요하면 엑셀로 받아 두세요.');
    return;
  }
  const title = tab === 'mock' ? '모의고사 성적 분석' : '내신 성적 분석';

  document.getElementById('print-name').textContent =
    (currentStudent ? currentStudent + ' ' : '') + title + ' 상담 자료';
  document.getElementById('print-meta').innerHTML = outPrintMeta(tab) + '<br>출력일 ' + _todayStr();
  outFitCharts();
  window.print();
}

/** 차트를 인쇄 폭에 다시 맞춘다.
 *  Chart.js는 캔버스 크기를 화면 기준으로 잡아 두기 때문에, 그대로 인쇄하면
 *  등급 추이·레이더가 카드를 뚫고 나간다. 인쇄 직전에 한 번 다시 재면 들어맞는다.
 *  (CSS의 @media print에도 안전망을 뒀다.) */
function outFitCharts() {
  if (typeof Chart === 'undefined') return;
  const reg = Chart.instances || (Chart.registry && Chart.registry.instances) || null;
  const list = reg ? Object.keys(reg).map(k => reg[k]) : [];
  list.forEach(c => { try { c.resize(); } catch (e) {} });
}

// 인쇄 대화상자를 브라우저 메뉴(Ctrl+P)로 열어도 같은 보정이 필요하다
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeprint', function () { outFitCharts(); });
  window.addEventListener('afterprint', function () { outFitCharts(); });
}

function outPrintMeta(tab) {
  const stu = currentStudent ? mockStudents[currentStudent] : null;

  if (tab === 'mock') {
    if (!stu) {
      const keys = ME.allExamKeys(mockStudents);
      return '학급 통계 · ' + Object.keys(mockStudents).length + '명 · ' + keys.length + '개 회차';
    }
    const series = ME.examSeries(stu, mockWeight, mockMergeTamgu);
    const last = series[series.length - 1];
    return series.length + '개 회차 · 최근 ' + mkEsc(last.fullLabel) +
      ' · 반영 평균 ' + mkFix(last.mainAvg) + '등급';
  }

  if (tab === 'fusion') {
    const n9 = naesinAvg9For(currentStudent);
    const j = ME.judgeTrack(n9, stu, { weightSet: mockWeight, mergeTamgu: mockMergeTamgu });
    if (j.incomplete) return '내신 또는 모의고사 자료가 부족합니다';
    return '내신 ' + mkFix(j.naesin9) + '등급 vs 모의 ' + mkFix(j.mockAvg) + '등급 (9등급 기준)' +
      ' · ' + j.track.label;
  }

  // 내신
  const avg = _avgOf(currentStudent, checkedSubjects);
  return ('고등학교') +
    ' · 선택 과목 ' + checkedSubjects.size + '개' +
    (avg !== null ? ' · 평균 ' + avg.toFixed(2) + ('등급') : '');
}

// ── 엑셀 ──────────────────────────────────────────────────────
async function outExcel() {
  if (!outGuard()) return;
  if (currentResultTab === 'naesin') { await downloadExcel(); return; }
  if (typeof _jobGuard === 'function' && !_jobGuard()) return;
  _batchBusy(true);
  showToast('엑셀 만드는 중…');
  try {
    if (currentResultTab === 'mock') await mkDownloadMockExcel();
    else if (currentResultTab === 'care') await careDownloadExcel();
    else await mkDownloadFusionExcel();
  } catch (e) {
    console.error(e);
    showToast('엑셀 생성 실패: ' + e.message);
  } finally { _batchBusy(false); }
}

// ── 프롬프트 ──────────────────────────────────────────────────
function outPrompt() {
  if (currentResultTab === 'fusion' || currentResultTab === 'care') return;   // 통합·상담 우선순위 탭에는 프롬프트가 없다
  if (!outGuard()) return;

  if (currentResultTab === 'mock') {
    if (!currentStudent || !mockStudents[currentStudent]) {
      showToast('모의고사 성적이 있는 학생을 선택해 주세요.');
      return;
    }
    const card = document.getElementById('mk-prompt-card');
    if (!card) { showToast('프롬프트를 만들지 못했습니다.'); return; }
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  document.getElementById('prompt-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 모의고사 탭의 프롬프트 복사 */
function mkCopyPrompt() {
  const ta = document.getElementById('mk-prompt-output');
  if (!ta) return;
  ta.select();
  navigator.clipboard.writeText(ta.value).then(
    () => showToast('클립보드에 복사됐습니다.'),
    () => { document.execCommand('copy'); showToast('클립보드에 복사됐습니다.'); }
  );
}

/* ══ 인쇄 2쪽 맞춤 (pfFit) ═══════════════════════════════════
   학생 한 명 분량을 A4 2쪽 안에 넣는다. 자료는 빼지 않는다.
   1) body.pdense — 인쇄용 촘촘한 배치(글자·여백·칸 나란히)
   2) 그래도 2쪽을 넘으면 그 학생 블록만 zoom으로 줄인다(최소 PF_MIN_ZOOM).
   인쇄 대화상자를 Ctrl+P로 열어도 돌도록 beforeprint에 건다. */
const PF_PAGE_H = 275 / 25.4 * 96;   // A4 297mm − 위아래 여백 11mm×2, CSS px
const PF_PAGES = 2;
const PF_SLACK = 0.9;                // 쪽 나눔에서 카드가 통째로 넘어가며 생기는 빈칸 몫
const PF_MIN_ZOOM = 0.55;

function pfTargets() {
  if (document.body.classList.contains('batch-print')) {
    return [...document.querySelectorAll('#batch-print-area .bp-student')].map(el => ({ el: el, extra: 0 }));
  }
  const tab = ['tab-naesin', 'tab-mock'].map(id => document.getElementById(id))
    .find(t => t && t.style.display !== 'none');
  if (!tab) return [];
  const ra = document.getElementById('result-area');
  const hf = [...ra.children].filter(c => c.classList.contains('print-head') || c.classList.contains('print-foot'))
    .reduce((s, c) => s + c.getBoundingClientRect().height, 0);
  return [{ el: tab, extra: hf + 12 }];
}

function pfReset() {
  document.body.classList.remove('pdense');
  document.querySelectorAll('[data-pf-zoom]').forEach(el => { el.style.zoom = ''; el.removeAttribute('data-pf-zoom'); });
}

function pfFit() {
  pfReset();
  if (!document.getElementById('result-area')) return [];
  document.body.classList.add('pdense');
  if (typeof outFitCharts === 'function') outFitCharts();
  const report = [];
  pfTargets().forEach(t => {
    const goal = PF_PAGES * PF_PAGE_H * PF_SLACK - t.extra;
    const h0 = t.el.getBoundingClientRect().height;
    let z = 1;
    if (h0 > goal) {
      // 줄이면 폭이 넓어져 줄바꿈이 줄고 높이가 더 준다 — 비례식 대신 몇 번 재서 찾는다
      let lo = PF_MIN_ZOOM, hi = 1;
      t.el.setAttribute('data-pf-zoom', '1');
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        t.el.style.zoom = mid;
        if (t.el.getBoundingClientRect().height <= goal) lo = mid; else hi = mid;
      }
      z = lo;
      t.el.style.zoom = z;
    }
    report.push({ h0: Math.round(h0), goal: Math.round(goal), zoom: Math.round(z * 100) / 100,
      h: Math.round(t.el.getBoundingClientRect().height) });
  });
  return report;
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeprint', function () { try { pfFit(); } catch (e) { console.error('[인쇄 맞춤]', e); } });
  window.addEventListener('afterprint', function () { try { pfReset(); if (typeof outFitCharts === 'function') outFitCharts(); } catch (e) {} });
}

/* ══════════════ ui/motion.js ══════════════ */
/* ═══════════════════════════════════════════════════════════════
   모션 (motion.js) — ui/motion.css와 짝
   ───────────────────────────────────────────────────────────────
   누르면 움직이는 곳들. 오프닝의 '돋보기로 훑는다'를 작게 이어 간다.

   · 분석         렌즈 아이콘이 흔들리고, 가는 선이 결과를 위에서 아래로 훑는다.
                  선이 지나가는 순간 카드가 하나씩 올라오고 요약 숫자가 굴러간다.
   · 결과 탭      흰 조각이 고른 탭으로 미끄러지고, 내용은 그 방향에서 들어온다.
   · 업로드       끄는 동안 점선이 돌고, 다 읽으면 체크가 그어진다.
   · 학생 선택    과목 칩이 차례로 깔리고 「분석」 버튼에 고리가 두 번 퍼진다.
   · 칩·섹션      누르면 톡. 펼치면 번호가 튀고 내용이 내려온다.
   · 복사         체크가 그어지고 프롬프트 칸이 한 번 밝아진다.
   · 토스트·모달  아래에서 떠오른다. 토스트 밑줄이 남은 시간을 줄여 간다.
   · 화면 톤      누른 자리에서 원이 번지며 종이 색이 바뀐다.
   · 실패         학생을 안 골랐으면 학생 칸이 도리질한다.

   원래 함수는 건드리지 않고 바깥에서 감싼다(motionInit). 감싸는 쪽이
   무슨 일로든 실패해도 원래 동작은 그대로 돈다.
   애니메이션 줄이기를 켠 사람에게는 아무것도 붙지 않는다.
   ═══════════════════════════════════════════════════════════════ */

const MO = { ok: false, gen: false, genOK: false, tab: 'naesin', toastT: 0 };
const MO_TABS = ['naesin', 'mock', 'fusion'];

// ── 작은 도구 ─────────────────────────────────────────────────
function moTry(f) { try { return f(); } catch (e) { return undefined; } }
function moLater(f, ms) { setTimeout(() => moTry(f), ms || 0); }
function moFrame(f) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => moTry(f));
  else moLater(f, 16);
}

/** 클래스를 뗐다 붙여 애니메이션을 처음부터 다시 돌린다 */
function moReplay(el, cls, ms) {
  if (!MO.ok || !el || !el.classList) return;
  el.classList.remove(cls);
  void el.offsetWidth;                // 다시 그리게 해서 같은 애니메이션이 또 돌게 한다
  el.classList.add(cls);
  clearTimeout(el['_mo_' + cls]);
  el['_mo_' + cls] = setTimeout(() => el.classList.remove(cls), ms || 600);
}

/** 여러 개를 차례로 (delay 간격, 최대 cap개까지만 — 나머지는 바로 보인다) */
function moStagger(list, cls, step, cap, base) {
  if (!MO.ok) return;
  const els = Array.prototype.filter.call(list || [], el => el && el.offsetParent !== null);
  els.slice(0, cap || 14).forEach((el, i) => {
    el.style.animationDelay = ((base || 0) + i * (step || 40)) + 'ms';
    moReplay(el, cls, 900 + (base || 0) + i * (step || 40));
    moLater(() => { el.style.animationDelay = ''; }, 920 + (base || 0) + i * (step || 40));
  });
}

const moEase = k => 1 - Math.pow(1 - k, 3);

/** 큰 숫자가 굴러가며 자리를 잡는다.
 *  등급처럼 작을수록 좋은 값은 나쁜 쪽에서 내려오고, 개수는 0에서 올라간다. */
function moCount(root, minFont, delay) {
  if (!MO.ok || !root || !document.createTreeWalker) return;
  const tw = document.createTreeWalker(root, 4 /* 글자 노드 */);
  const jobs = [];
  const gmax = (typeof gradeSystemMax === 'number' && gradeSystemMax) ? gradeSystemMax : 9;
  while (tw.nextNode()) {
    const n = tw.currentNode;
    const m = /^(\s*)(\d{1,3}(?:\.\d+)?)(?![\d.])(\D*)$/.exec(n.nodeValue || '');
    if (!m || !n.parentNode) continue;
    const fs = parseFloat(getComputedStyle(n.parentNode).fontSize) || 0;
    if (fs < (minFont || 18)) continue;
    const to = parseFloat(m[2]);
    if (!isFinite(to) || to > 100) continue;
    const dec = (m[2].split('.')[1] || '').length;
    const tail = m[3];
    const gradeLike = to <= gmax && (dec > 0 || /^\s*등급/.test(tail));
    const from = gradeLike ? Math.min(gmax, to + 2.6) : 0;
    if (from === to) continue;
    jobs.push({ n: n, lead: m[1], tail: tail, from: from, to: to, dec: dec });
  }
  if (!jobs.length) return;
  const D = 640;
  let t0 = 0;
  const step = now => {
    if (!t0) t0 = now + (delay || 0);
    const k = Math.max(0, Math.min(1, (now - t0) / D));
    const e = moEase(k);
    for (const j of jobs) {
      const v = j.from + (j.to - j.from) * e;
      j.n.nodeValue = j.lead + (k >= 1 ? j.to.toFixed(j.dec) : (j.dec ? v.toFixed(j.dec) : String(Math.round(v)))) + j.tail;
    }
    if (k < 1) requestAnimationFrame(step);
  };
  // 첫 장면부터 출발값을 보여 준다 (원래 값이 번쩍 보였다 굴러가는 걸 막는다)
  for (const j of jobs) j.n.nodeValue = j.lead + (j.dec ? j.from.toFixed(j.dec) : String(Math.round(j.from))) + j.tail;
  requestAnimationFrame(step);
  // 창이 가려져 프레임이 멈춰도 숫자가 출발값에 머물지 않게 — 시간이 지나면 제자리에 꽂는다
  setTimeout(() => { for (const j of jobs) j.n.nodeValue = j.lead + j.to.toFixed(j.dec) + j.tail; }, (delay || 0) + D + 400);
}

// ── 미끄러지는 탭 표시 ────────────────────────────────────────
/** 묶음(box) 안에서 고른 버튼 뒤로 흰 조각을 옮긴다 */
function moSeg(box, instant) {
  if (!MO.ok || !box) return;
  let ind = box.querySelector(':scope>.mo-ind');
  if (!ind) {
    ind = document.createElement('span');
    ind.className = 'mo-ind';
    box.insertBefore(ind, box.firstChild);
    box.classList.add('mo-seg');
    instant = true;
  }
  const btn = box.querySelector(':scope>button.active');
  if (!btn || !btn.offsetWidth) { box.classList.remove('mo-live'); return; }   // 숨어 있으면 나중에 다시 잰다
  if (instant || !box.classList.contains('mo-live')) box.classList.remove('mo-anim');
  ind.style.width = btn.offsetWidth + 'px';
  ind.style.height = btn.offsetHeight + 'px';
  ind.style.transform = 'translate(' + btn.offsetLeft + 'px,' + btn.offsetTop + 'px)';
  box.classList.add('mo-live');
  if (instant) { void ind.offsetWidth; moFrame(() => box.classList.add('mo-anim')); }
  else box.classList.add('mo-anim');
}
function moSegAll(instant) {
  moTry(() => moSeg(document.getElementById('rtabs'), instant));
  moTry(() => moSeg(document.querySelector('#guide-modal .gd-tabs'), instant));
  moTry(() => moSeg(document.querySelector('.mk-sub'), instant));
}

// ── 분석: 훑기 ────────────────────────────────────────────────
function moScanResults() {
  if (!MO.ok) return;
  const rb = document.querySelector('.rbody');
  const pane = document.getElementById('tab-' + (typeof currentResultTab === 'string' ? currentResultTab : 'naesin'));
  if (!rb || !pane) return;
  const view = rb.clientHeight || 600;
  const top = rb.scrollTop;
  const DUR = 760;

  let line = rb.querySelector(':scope>.mo-scan');
  if (!line) { line = document.createElement('div'); line.className = 'mo-scan'; rb.appendChild(line); }
  line.style.top = top + 'px';
  line.style.setProperty('--mo-scan-h', view + 'px');
  line.style.setProperty('--mo-scan-ms', DUR + 'ms');
  moReplay(line, 'go', DUR + 60);

  // 선이 지나가는 시각에 맞춰 카드가 올라온다 (화면에 보이는 것만)
  const cards = pane.querySelectorAll('.result-card,.prompt-card');
  const rbTop = rb.getBoundingClientRect().top;
  let n = 0;
  Array.prototype.forEach.call(cards, el => {
    if (el.offsetParent === null || n > 12) return;
    const y = el.getBoundingClientRect().top - rbTop;
    if (y > view + 20) return;
    const k = Math.max(0, Math.min(1, y / view));
    const d = Math.round(k * DUR * .8) + (n % 2) * 30;   // 나란한 두 카드는 살짝 엇갈려
    el.style.animationDelay = d + 'ms';
    moReplay(el, 'mo-in', d + 700);
    moLater(() => { el.style.animationDelay = ''; }, d + 720);
    n++;
  });
  moCount(document.getElementById('summary-content'), 16, 140);
  if (currentResultTab !== 'naesin') moCount(pane, 22, 160);
}

// ── 단계 표시 (시작 화면의 1·2·3) ─────────────────────────────
function moSteps() {
  const steps = document.querySelectorAll('.empty-steps>div');
  if (!steps.length) return;
  const hasData = (typeof allStudents === 'object' && allStudents && Object.keys(allStudents).length > 0) ||
                  (typeof mkHasData === 'function' && moTry(mkHasData));
  const done = [!!hasData, !!(hasData && typeof currentStudent !== 'undefined' && currentStudent), false];
  let next = done.indexOf(false);
  Array.prototype.forEach.call(steps, (d, i) => {
    const b = d.querySelector('b');
    if (b && !b.dataset.n) b.dataset.n = b.textContent;
    const wasDone = d.classList.contains('mo-done');
    d.classList.toggle('mo-done', done[i]);
    d.classList.toggle('mo-next', MO.ok && i === next);
    if (b && wasDone !== done[i]) b.innerHTML = done[i] ? ic('check', 11) : b.dataset.n;
  });
}

// ── 복사됨 ────────────────────────────────────────────────────
function moCopied(btn, ta) {
  if (ta) moReplay(ta, 'mo-flash', 820);
  if (!btn) return;
  if (!btn._moHtml) btn._moHtml = btn.innerHTML;
  btn.innerHTML = ic('check', 14) + ' 복사됨';
  btn.classList.add('mo-copied');
  moReplay(btn, 'mo-pop', 380);
  clearTimeout(btn._moCopyT);
  btn._moCopyT = setTimeout(() => {
    btn.classList.remove('mo-copied');
    btn.innerHTML = btn._moHtml; btn._moHtml = '';
  }, 1700);
}

// ── 바꿔 끼우기 ───────────────────────────────────────────────
/** 전역 함수 name을 감싼다. before/after가 실패해도 원래 함수는 돈다. */
function moWrap(name, before, after) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig._mo) return;
  const w = function () {
    const ctx = before ? moTry(() => before.apply(this, arguments)) : undefined;
    const r = orig.apply(this, arguments);
    if (after) {
      const args = arguments;
      if (r && typeof r.then === 'function') r.then(v => moTry(() => after(ctx, args, v)), () => {});
      else moTry(() => after(ctx, args, r));
    }
    return r;
  };
  w._mo = true;
  w._orig = orig;
  window[name] = w;
}

/** 모션이 어떤 이유로든 실패해도 앱은 그대로 돈다 */
function motionInit() {
  try { motionSetup(); } catch (e) { MO.ok = false; }
}

function motionSetup() {
  MO.ok = !!moTry(() =>
    typeof requestAnimationFrame === 'function' &&
    !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) &&
    !!document.body && !!document.body.classList);
  MO.tab = typeof currentResultTab === 'string' ? currentResultTab : 'naesin';

  // 토스트: 떠오르고, 다시 부르면 시간이 처음부터 (원래는 앞 타이머가 새 알림을 일찍 닫았다)
  window.showToast = function (m) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m;
    clearTimeout(MO.toastT);
    t.style.opacity = '';
    t.classList.remove('mo-on');
    void t.offsetWidth;
    t.classList.add('mo-on');
    MO.toastT = setTimeout(() => { t.classList.remove('mo-on'); }, 2800);
  };

  // 프롬프트 복사 — 원래는 초록을 박아 넣고 아이콘을 지웠다
  window.copyPrompt = function () {
    const ta = document.getElementById('prompt-output');
    const txt = ta && ta.value;
    if (!txt) return;
    const done = () => { moCopied(document.getElementById('copy-btn'), ta); showToast('클립보드에 복사됐습니다.'); };
    const legacy = () => { ta.select(); document.execCommand('copy'); done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, legacy);
    else legacy();
  };
  moWrap('mkCopyPrompt',
    () => document.activeElement,
    (btn) => moCopied(btn && btn.tagName === 'BUTTON' ? btn : null, document.getElementById('mk-prompt-output')));

  // 분석
  moWrap('generateAll',
    () => {
      MO.gen = true; MO.genOK = false;
      moReplay(document.querySelector('.act-btn.pri'), 'mo-scanbtn', 700);
    },
    () => {
      MO.gen = false;
      if (MO.genOK) {
        MO.scanAt = Date.now();
        const pri = document.querySelector('.act-btn.pri');
        if (pri) pri.classList.remove('mo-nudge');
        const rb = document.querySelector('.rbody');
        if (rb && window.innerWidth > 768) rb.scrollTop = 0;
        moFrame(moScanResults);
        moSteps();
        return;
      }
      // 실패: 무엇이 빠졌는지 그 자리가 도리질한다
      if (typeof currentStudent === 'undefined' || !currentStudent) moReplay(document.querySelector('.tb-stu'), 'mo-shake', 460);
      else {
        moReplay(document.querySelector('.act-btn.pri'), 'mo-shake', 460);
        const s2 = document.getElementById('s2');
        if (s2 && !document.body.classList.contains('rail')) moReplay(s2, 'mo-shake', 460);
      }
    });

  // 결과 탭
  moWrap('switchResultTab',
    () => MO.tab,
    (prev, args) => {
      const tab = args[0];
      MO.tab = tab;
      if (MO.gen) { MO.genOK = true; moFrame(() => moSegAll(false)); return; }
      moSeg(document.getElementById('rtabs'));
      // 분석 직후 곧장 탭을 바꾸는 경우(지도에서 학생 누르기) — 훑기가 새 탭에서 돌므로 미끄러짐은 생략
      if (prev === tab || Date.now() - (MO.scanAt || 0) < 400) return;
      const p = document.getElementById('tab-' + tab);
      const dir = MO_TABS.indexOf(tab) > MO_TABS.indexOf(prev) ? 'mo-from-r' : 'mo-from-l';
      moReplay(p, dir, 400);
      if (tab !== 'naesin') moCount(p, 22, 60);
    });

  // 업로드 완료
  moWrap('applyParseResult', null, () => {
    moReplay(document.getElementById('upload-zone'), 'mo-done', 1000);
    moReplay(document.getElementById('file-info'), 'mo-fade', 400);
    moReplay(document.getElementById('batch-count'), 'mo-pop', 400);
    moSteps();
  });
  // 모의고사 회차 칩: 새로 생긴 것만 톡
  moWrap('mkRenderChips',
    () => {
      const box = document.getElementById('mk-chips');
      return box ? Array.prototype.map.call(box.children, c => c.textContent) : [];
    },
    (old) => {
      const box = document.getElementById('mk-chips');
      if (!box || !old) return;
      const fresh = Array.prototype.filter.call(box.children, c => old.indexOf(c.textContent) < 0);
      if (fresh.length && fresh.length < box.children.length + 1) moStagger(fresh, 'mo-popin', 50, 12);
      moSteps();
    });
  moWrap('mkUpdateTabBadges', () => {
    const b = document.getElementById('rtab-mock-badge');
    return b ? b.textContent : '';
  }, (old) => {
    const b = document.getElementById('rtab-mock-badge');
    if (b && b.textContent && b.textContent !== old) moReplay(b, 'mo-pop', 400);
    moFrame(() => moSeg(document.getElementById('rtabs'), true));
  });

  // 섹션 접기/펴기
  const opened = id => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('collapsed')) moReplay(el, 'mo-open', 450);
  };
  moWrap('ts', null, (c, args) => opened(args[0]));
  moWrap('openSection', null, (c, args) => opened(args[0]));

  // 학교급·파일 종류
  const popActive = sel => moReplay(document.querySelector(sel), 'mo-pop', 380);
  moWrap('selectSchoolLevel', null, () => popActive('.slchip.active'));
  moWrap('selectFileType', null, () => {
    popActive('.fchip.active');
    moStagger(document.querySelectorAll('#s0 .note'), 'mo-fade', 0, 6);
  });
  moWrap('selectMockInput', null, (c, args) => {
    moSeg(document.querySelector('.mk-sub'));
    moReplay(document.getElementById('mk-pane-' + args[0]), 'mo-fade', 360);
  });

  // 학생 선택 → 과목 칩이 깔리고, 다음 할 일(분석)에 고리
  moWrap('onStudentChange', null, () => {
    moStagger(document.querySelectorAll('#subj-grid .subj-chip'), 'mo-popin', 16, 30);
    moReplay(document.getElementById('stu-badge'), 'mo-popin', 450);
    if (typeof currentStudent !== 'undefined' && currentStudent) moReplay(document.querySelector('.act-btn.pri'), 'mo-nudge', 2300);
    moSteps();
  });
  moWrap('toggleSubj', null, (c, args) => moReplay(args[0], 'mo-pop', 380));
  moWrap('checkAll', null, () => moStagger(document.querySelectorAll('#subj-grid .subj-chip'), 'mo-pop', 18, 40));

  // 9등급 환산 · 학년 탭 · 레일
  moWrap('toggle9Grade', null, () => {
    moReplay(document.getElementById('grade-table-wrap'), 'mo-swap', 420);
    moReplay(document.getElementById('conv9-toggle'), 'mo-pop', 380);
  });
  moWrap('buildNearMiss', null, () => {
    if (MO.gen) return;
    const box = document.getElementById('near-miss-content');
    if (!box) return;
    const grid = box.querySelector('.nm-grid');
    moStagger(grid ? grid.children : box.children, 'mo-in', 35, 12);
  });
  moWrap('toggleRail', null, () => moLater(() => moSegAll(true), 280));

  // 사용법
  moWrap('gdTab', null, () => moSeg(document.querySelector('#guide-modal .gd-tabs')));
  moWrap('openGuide', () => {
    const m = document.getElementById('guide-modal');
    if (m) { m.classList.remove('mo-out'); clearTimeout(m._moT); }
  }, () => moFrame(() => moSeg(document.querySelector('#guide-modal .gd-tabs'), true)));
  const closeG = window.closeGuide;
  window.closeGuide = function () {
    const m = document.getElementById('guide-modal');
    if (!m) return;
    if (m.classList.contains('mo-out')) return;                     // 이미 닫히는 중
    if (!MO.ok || !m.classList.contains('open')) { closeG(); return; }
    m.classList.add('mo-out');
    m._moT = setTimeout(() => { m.classList.remove('mo-out'); closeG(); }, 170);
  };

  // 화면 톤: 누른 자리에서 원이 번진다
  const toneOrig = window.toggleDark;
  window.toggleDark = function () {
    const btn = document.getElementById('dark-btn');
    const vt = MO.ok && btn && typeof document.startViewTransition === 'function';
    if (!vt) { toneOrig(); moReplay(document.getElementById('dark-btn'), 'mo-spin', 650); return; }
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const R = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const tr = document.startViewTransition(() => toneOrig());
    tr.ready.then(() => {
      document.documentElement.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 620, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
    tr.finished.then(() => moReplay(document.getElementById('dark-btn'), 'mo-spin', 650)).catch(() => {});
  };

  // 초기화
  moWrap('resetAll', null, () => {
    if (typeof allStudents === 'object' && Object.keys(allStudents).length) return;   // 취소함
    moReplay(document.querySelector('.hdr-acts .btn.danger'), 'mo-spin', 650);
    moReplay(document.getElementById('empty-state'), 'mo-in', 700);
    moSteps();
  });

  // 결과 유무가 바뀌면 탭 표시를 다시 잰다
  moWrap('uiRefresh', null, () => { moSteps(); moFrame(() => moSegAll(false)); });

  // 차트: 화면에 그리는 방사형·과목군 막대는 자라나며 나온다 (인쇄용 PNG는 그대로 멈춘 그림)
  ['radarConfig', 'catBarConfig'].forEach(name => {
    const orig = window[name];
    if (typeof orig !== 'function' || orig._mo) return;
    const w = function (a, o) {
      const cfg = orig.apply(this, arguments);
      moTry(() => {
        if (MO.ok && !(o && o.png) && cfg && cfg.options) cfg.options.animation = { duration: 760, easing: 'easeOutQuart' };
      });
      return cfg;
    };
    w._mo = true;
    window[name] = w;
  });

  if (MO.ok) {
    window.addEventListener('resize', () => { clearTimeout(MO.rsT); MO.rsT = setTimeout(() => moTry(() => moSegAll(true)), 120); });
    moSegAll(true);
  }
  moSteps();
}

/* ══════════════ 시작 ══════════════ */
shellInit();
mkInitPanel();
mkStoreRender();
if (mkStoreInfo().ok) mkStoreLoad(true);
uiRefresh();
motionInit();   // 저장분을 다 불러온 뒤에 감싼다 — 시작할 때는 움직이지 않는다

// 초기화 완료 — 사용자의 성적 파일 업로드를 기다립니다.
// (사전테스트용 가상 데이터 자동 로드 제거됨)
// ===============================================
// PWA SERVICE WORKER REGISTRATION (?ㅽ봽?쇱씤 吏??
// ===============================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').then(function(reg) {
      console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
    }).catch(function(err) {
      console.warn('[PWA] ServiceWorker registration failed:', err);
    });
  });
}
