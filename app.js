// ==================== 状态管理 ====================
const STORAGE_KEY = 'word-teacher-data';

let state = {
  words: [],
  books: [],
  units: [],
  lessons: [],
  currentBook: null,
  currentUnit: null,
  currentLesson: null,
  currentWordIndex: 0,
  filteredWords: [],
  toolMode: 'normal',
  selectedColor: '#FF6B6B',
  isPureMode: false,
  importBuffer: [],
  dictationMode: 'submit',
  paintColor: '#FF6B6B',
  paintSize: 3,
  paintShape: 'pen',
  paintHistory: [],
  // ===== 自动同步相关 =====
  lastCloudModified: 0,   // 云端数据最后修改时间
  lastLocalSaved: 0,      // 本地最后保存时间
  autoUploadTimer: null,  // 防抖上传定时器
  pollTimer: null,        // 轮询定时器
  syncingUpload: false,   // 是否正在上传中（防重复）
  syncingDownload: false  // 是否正在下载中（防重复）
};

// 示例单词数据
const sampleWords = [
  { id: '1', word: 'teacher', meaning: '老师', partOfSpeech: 'n.', phonetic: '/ˈtiːtʃə(r)/', book: '人教版三年级上册', unit: 'Unit 1', lesson: 'Lesson 1', tags: ['职业', '人物'], letterColors: [], splitPoints: [], imageUrl: '', order: 1 },
  { id: '2', word: 'student', meaning: '学生', partOfSpeech: 'n.', phonetic: '/ˈstjuːdnt/', book: '人教版三年级上册', unit: 'Unit 1', lesson: 'Lesson 1', tags: ['职业', '人物'], letterColors: [], splitPoints: [], imageUrl: '', order: 2 },
  { id: '3', word: 'apple', meaning: '苹果', partOfSpeech: 'n.', phonetic: '/ˈæpl/', book: '人教版三年级上册', unit: 'Unit 1', lesson: 'Lesson 2', tags: ['水果', '食物'], letterColors: [], splitPoints: [], imageUrl: '', order: 3 },
  { id: '4', word: 'book', meaning: '书', partOfSpeech: 'n.', phonetic: '/bʊk/', book: '人教版三年级上册', unit: 'Unit 1', lesson: 'Lesson 2', tags: ['学习用品'], letterColors: [], splitPoints: [], imageUrl: '', order: 4 },
  { id: '5', word: 'cat', meaning: '猫', partOfSpeech: 'n.', phonetic: '/kæt/', book: '人教版三年级上册', unit: 'Unit 2', lesson: 'Lesson 1', tags: ['动物'], letterColors: [], splitPoints: [], imageUrl: '', order: 5 },
  { id: '6', word: 'dog', meaning: '狗', partOfSpeech: 'n.', phonetic: '/dɒɡ/', book: '人教版三年级上册', unit: 'Unit 2', lesson: 'Lesson 1', tags: ['动物'], letterColors: [], splitPoints: [], imageUrl: '', order: 6 },
  { id: '7', word: 'red', meaning: '红色的', partOfSpeech: 'adj.', phonetic: '/red/', book: '人教版三年级上册', unit: 'Unit 2', lesson: 'Lesson 2', tags: ['颜色'], letterColors: [], splitPoints: [], imageUrl: '', order: 7 },
  { id: '8', word: 'happy', meaning: '开心的', partOfSpeech: 'adj.', phonetic: '/ˈhæpi/', book: '人教版三年级下册', unit: 'Unit 1', lesson: 'Lesson 1', tags: ['情绪'], letterColors: [], splitPoints: [], imageUrl: '', order: 8 },
];

// ==================== 初始化 ====================
function init() {
  loadData();
  if (state.words.length === 0) {
    state.words = sampleWords;
    saveData();
  }
  updateFilters();
  renderBookTags();
  renderUnitTags();
  renderLessonTags();
  renderWordTable();
  lucide.createIcons();
  
  initPaintCanvas();
  initToolbarDrag();
  initPanelDrag();
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isPureMode) {
      togglePureMode();
    }
  });
  
  window.addEventListener('resize', () => {
    resizePaintCanvas();
    redrawPaint();
  });

  // ===== 自动同步启动 =====
  setTimeout(() => {
    if (hasSyncConfig()) {
      // 静默拉取一次云端最新数据
      autoDownloadFromCloud(true);
      // 开始 30 秒轮询检查
      startAutoPoll();
      showSyncToast('✅ 自动同步已启动');
    }
  }, 2000);
}

// ==================== 数据持久化 ====================
function saveData() {
  const data = {
    words: state.words
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  // ===== 自动上传（防抖 3 秒） =====
  state.lastLocalSaved = Date.now();
  if (hasSyncConfig()) {
    if (state.autoUploadTimer) {
      clearTimeout(state.autoUploadTimer);
    }
    state.autoUploadTimer = setTimeout(() => {
      autoUploadToCloud();
    }, 3000);
  }
}

function loadData() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      state.words = parsed.words || [];
    } catch (e) {
      console.error('加载数据失败', e);
    }
  }
}

function updateFilters() {
  const bookSet = new Set();
  const unitSet = new Set();
  const lessonSet = new Set();
  
  // 书本：取所有数据（不受任何筛选影响）
  state.words.forEach(w => {
    if (w.book) bookSet.add(w.book);
  });
  
  // 单元：只受书本筛选影响，不受单元/课选中影响
  let unitWords = [...state.words];
  if (state.currentBook) {
    unitWords = unitWords.filter(w => w.book === state.currentBook);
  }
  unitWords.forEach(w => {
    if (w.unit) unitSet.add(w.unit);
  });
  
  // 课：受书本+单元筛选影响，不受课选中影响
  let lessonWords = [...state.words];
  if (state.currentBook) {
    lessonWords = lessonWords.filter(w => w.book === state.currentBook);
  }
  if (state.currentUnit) {
    lessonWords = lessonWords.filter(w => w.unit === state.currentUnit);
  }
  lessonWords.forEach(w => {
    if (w.lesson) lessonSet.add(w.lesson);
  });
  
  state.books = Array.from(bookSet);
  state.units = Array.from(unitSet);
  state.lessons = Array.from(lessonSet);
}

// ==================== 单词列表页 ====================
function getFilteredWords() {
  let words = [...state.words];
  if (state.currentBook) {
    words = words.filter(w => w.book === state.currentBook);
  }
  if (state.currentUnit) {
    words = words.filter(w => w.unit === state.currentUnit);
  }
  if (state.currentLesson) {
    words = words.filter(w => w.lesson === state.currentLesson);
  }
  return words.sort((a, b) => (a.order || 0) - (b.order || 0));
}

function renderBookTags() {
  const container = document.getElementById('book-tags');
  let html = `<div class="unit-tag ${!state.currentBook ? 'active' : ''}" onclick="selectBook(null)">全部</div>`;
  state.books.forEach(book => {
    html += `<div class="unit-tag ${state.currentBook === book ? 'active' : ''}" onclick="selectBook('${book}')">${book}</div>`;
  });
  container.innerHTML = html;
}

function renderUnitTags() {
  const container = document.getElementById('unit-tags');
  let html = `<div class="unit-tag ${!state.currentUnit ? 'active' : ''}" onclick="selectUnit(null)">全部</div>`;
  state.units.forEach(unit => {
    html += `<div class="unit-tag ${state.currentUnit === unit ? 'active' : ''}" onclick="selectUnit('${unit}')">${unit}</div>`;
  });
  container.innerHTML = html;
}

function renderLessonTags() {
  const container = document.getElementById('lesson-tags');
  if (state.lessons && state.lessons.length > 0) {
    let html = `<div class="unit-tag ${!state.currentLesson ? 'active' : ''}" onclick="selectLesson(null)">全部</div>`;
    state.lessons.forEach(lesson => {
      html += `<div class="unit-tag ${state.currentLesson === lesson ? 'active' : ''}" onclick="selectLesson('${lesson}')">${lesson}</div>`;
    });
    container.innerHTML = html;
    container.parentElement.classList.remove('hidden');
  } else {
    container.parentElement.classList.add('hidden');
  }
}

function selectBook(book) {
  state.currentBook = book;
  state.currentUnit = null;
  state.currentLesson = null;
  updateFilters();
  renderBookTags();
  renderUnitTags();
  renderLessonTags();
  renderWordTable();
  updateEditButtons();
}

function selectUnit(unit) {
  state.currentUnit = unit;
  state.currentLesson = null;
  updateFilters();
  renderUnitTags();
  renderLessonTags();
  renderWordTable();
  updateEditButtons();
}

function selectLesson(lesson) {
  state.currentLesson = lesson;
  updateFilters();
  renderBookTags();
  renderUnitTags();
  renderLessonTags();
  renderWordTable();
  updateEditButtons();
}

function renderWordTable() {
  const tbody = document.getElementById('word-table-body');
  const emptyState = document.getElementById('empty-state');
  const words = getFilteredWords();
  
  if (words.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  let html = '';
  words.forEach((word, index) => {
    html += `
      <tr class="word-table-row border-b border-gray-100" onclick="openWordDetail('${word.id}')">
        <td class="px-6 py-4 text-gray-400 font-bold">${index + 1}</td>
        <td class="px-6 py-4">
          <span class="font-bold text-lg text-gray-800">${word.word}</span>
        </td>
        <td class="px-6 py-4 text-gray-500">${word.phonetic || ''}</td>
        <td class="px-6 py-4">
          ${word.partOfSpeech ? `<span class="text-orange-500 font-bold text-sm bg-orange-100 px-2 py-1 rounded-full">${word.partOfSpeech}</span>` : ''}
        </td>
        <td class="px-6 py-4 text-gray-700">${word.meaning}</td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-1">
            <button onclick="event.stopPropagation(); openEditModal('word', 'edit', null, '${word.id}')" class="text-gray-400 hover:text-orange-500 p-2 rounded-lg hover:bg-orange-50 transition-all" title="编辑单词">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteWord('${word.id}', event)" class="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-all" title="删除单词">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
  lucide.createIcons();
}

// ==================== 单词详情页 ====================
function openWordDetail(wordId) {
  const words = getFilteredWords();
  const index = words.findIndex(w => w.id === wordId);
  if (index === -1) return;
  
  state.currentWordIndex = index;
  state.filteredWords = words;
  
  document.getElementById('list-page').classList.add('hidden');
  document.getElementById('detail-page').classList.remove('hidden');
  document.getElementById('detail-page').classList.add('page-transition');
  
  renderWordDetail();
  resizePaintCanvas();
  clearPaint();
  resetToolbarPosition();
}

function goBackToList() {
  document.getElementById('detail-page').classList.add('hidden');
  document.getElementById('list-page').classList.remove('hidden');
  setToolMode('normal');
  exitDictation();
}

function getCurrentWord() {
  if (!state.filteredWords || state.filteredWords.length === 0) return null;
  return state.filteredWords[state.currentWordIndex];
}

function renderWordDetail() {
  const word = getCurrentWord();
  if (!word) return;
  
  document.getElementById('word-index').textContent = `${state.currentWordIndex + 1} / ${state.filteredWords.length}`;
  
  const posEl = document.getElementById('word-pos');
  const meaningContainer = document.getElementById('word-meaning');
  const meaningTextEl = meaningContainer.querySelector('span:last-child');
  
  if (word.partOfSpeech) {
    posEl.textContent = word.partOfSpeech;
    posEl.classList.remove('hidden');
  } else {
    posEl.classList.add('hidden');
  }
  
  meaningTextEl.textContent = word.meaning || '';
  document.getElementById('dictation-meaning').textContent = word.meaning || '';
  
  renderWordSpelling();
  renderPhonetic();
  updateWordImage(word);
}

function renderPhonetic() {
  const word = getCurrentWord();
  if (!word || !word.phonetic) {
    document.getElementById('word-phonetic').innerHTML = '';
    return;
  }
  
  const container = document.getElementById('word-phonetic');
  const chars = word.phonetic.split('');
  let html = '';
  
  chars.forEach((char, index) => {
    const colorObj = word.phoneticColors?.find(c => c.index === index);
    const color = colorObj?.color || '';
    
    html += `<span class="phonetic-char" style="color: ${color}" data-index="${index}" onmousedown="handlePhoneticMouseDown(${index}, this)" onmouseenter="handlePhoneticMouseEnter(${index})">${char}</span>`;
  });
  
  container.innerHTML = html;
}

function renderWordSpelling() {
  const word = getCurrentWord();
  if (!word) return;
  
  const container = document.getElementById('word-spelling');
  const letters = word.word.split('');
  let html = '';
  
  letters.forEach((letter, index) => {
    // 空格渲染为可见间隙（用固定宽度的空白 span）
    if (letter === ' ') {
      html += `<span class="word-space"></span>`;
      return;
    }
    const colorObj = word.letterColors?.find(c => c.index === index);
    const color = colorObj?.color || '';
    const hasSplit = word.splitPoints?.includes(index);
    
    html += `<span class="word-letter" style="color: ${color}" data-index="${index}" onmousedown="handleLetterMouseDown(${index}, this)" onmouseenter="handleLetterMouseEnter(${index})">${letter}</span>`;
    
    if (hasSplit && index < letters.length - 1) {
      html += `<span class="split-dot">·</span>`;
    }
  });
  
  container.innerHTML = html;
}

function updateWordImage(word) {
  const imgContainer = document.getElementById('word-image');
  
  if (word.imageUrl) {
    imgContainer.innerHTML = `<img src="${word.imageUrl}" alt="${word.word}" class="w-full h-full object-cover">`;
    imgContainer.classList.remove('hidden');
    return;
  }
  
  const emojiMap = {
    '动物': '🐾', '水果': '🍎', '食物': '🍔', '颜色': '🎨',
    '职业': '👨‍🏫', '人物': '👤', '学习用品': '📚', '情绪': '😊'
  };
  
  let hasMatch = false;
  let emoji = '📖';
  if (word.tags) {
    for (const tag of word.tags) {
      if (emojiMap[tag]) {
        emoji = emojiMap[tag];
        hasMatch = true;
        break;
      }
    }
  }
  
  if (hasMatch || word.imageUrl) {
    imgContainer.innerHTML = `<span class="text-5xl">${emoji}</span>`;
    imgContainer.classList.remove('hidden');
  } else {
    imgContainer.classList.add('hidden');
  }
}

function prevWord() {
  if (!state.filteredWords || state.filteredWords.length === 0) return;
  if (state.currentWordIndex > 0) {
    state.currentWordIndex--;
    renderWordDetail();
    clearPaint();
  }
}

function nextWord() {
  if (!state.filteredWords || state.filteredWords.length === 0) return;
  if (state.currentWordIndex < state.filteredWords.length - 1) {
    state.currentWordIndex++;
    // 听写模式下退出听写，显示新单词的拼读页面
    const dictationArea = document.getElementById('dictation-area');
    if (dictationArea && !dictationArea.classList.contains('hidden')) {
      exitDictation();
    }
    renderWordDetail();
    clearPaint();
    clearPronounceArrows();
  }
}

// ==================== 工具栏拖拽 ====================
let isDraggingToolbar = false;
let dragStartX = 0, dragStartY = 0;
let toolbarStartLeft = 0, toolbarStartTop = 0;

function initToolbarDrag() {
  const wrapper = document.getElementById('toolbar-wrapper');
  if (!wrapper) return;
  
  wrapper.addEventListener('mousedown', startToolbarDrag);
  document.addEventListener('mousemove', onToolbarDrag);
  document.addEventListener('mouseup', stopToolbarDrag);
}

function startToolbarDrag(e) {
  if (e.target.closest('.tool-btn') || e.target.closest('button')) return;
  
  isDraggingToolbar = true;
  const wrapper = document.getElementById('toolbar-wrapper');
  const rect = wrapper.getBoundingClientRect();
  
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  toolbarStartLeft = rect.left;
  toolbarStartTop = rect.top;
  
  wrapper.style.left = rect.left + 'px';
  wrapper.style.top = rect.top + 'px';
  wrapper.style.bottom = 'auto';
  wrapper.style.transform = 'none';
}

function onToolbarDrag(e) {
  if (!isDraggingToolbar) return;
  
  const wrapper = document.getElementById('toolbar-wrapper');
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  
  let newLeft = toolbarStartLeft + dx;
  let newTop = toolbarStartTop + dy;
  
  const w = wrapper.offsetWidth || 600;
  const h = wrapper.offsetHeight || 60;
  const maxLeft = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - h);
  
  newLeft = Math.max(0, Math.min(newLeft, maxLeft));
  newTop = Math.max(0, Math.min(newTop, maxTop));
  
  wrapper.style.left = newLeft + 'px';
  wrapper.style.top = newTop + 'px';
  wrapper.style.right = 'auto';
  wrapper.style.bottom = 'auto';
  wrapper.style.transform = 'none';
  
  updatePanelPosition();
}

function stopToolbarDrag() {
  isDraggingToolbar = false;
}

function resetToolbarPosition() {
  const wrapper = document.getElementById('toolbar-wrapper');
  if (!wrapper) return;
  wrapper.style.left = '50%';
  wrapper.style.top = 'auto';
  wrapper.style.bottom = '30px';
  wrapper.style.transform = 'translateX(-50%)';
  
  const colorWrapper = document.getElementById('color-panel-wrapper');
  const paintWrapper = document.getElementById('paint-panel-wrapper');
  colorWrapper.style.left = '50%';
  colorWrapper.style.transform = 'translateX(-50%)';
  colorWrapper.style.bottom = '100px';
  colorWrapper.style.top = 'auto';
  paintWrapper.style.left = '50%';
  paintWrapper.style.transform = 'translateX(-50%)';
  paintWrapper.style.bottom = '100px';
  paintWrapper.style.top = 'auto';
}

function updatePanelPosition() {
}

let panelDragState = {
  isDragging: false,
  currentPanel: null,
  startX: 0,
  startY: 0,
  panelStartLeft: 0,
  panelStartTop: 0
};

function initPanelDrag() {
  document.addEventListener('mousedown', startPanelDrag);
  document.addEventListener('mousemove', onPanelDrag);
  document.addEventListener('mouseup', stopPanelDrag);
}

function startPanelDrag(e) {
  const colorWrapper = document.getElementById('color-panel-wrapper');
  const paintWrapper = document.getElementById('paint-panel-wrapper');
  
  let target = null;
  if (e.target.closest('#color-panel-wrapper')) {
    target = colorWrapper;
  } else if (e.target.closest('#paint-panel-wrapper')) {
    target = paintWrapper;
  }
  
  if (!target) return;
  if (e.target.closest('.color-circle') || e.target.closest('button') || e.target.closest('.paint-size-btn') || e.target.closest('.paint-shape-btn')) return;
  
  panelDragState.isDragging = true;
  panelDragState.currentPanel = target;
  const rect = target.getBoundingClientRect();
  
  panelDragState.startX = e.clientX;
  panelDragState.startY = e.clientY;
  panelDragState.panelStartLeft = rect.left;
  panelDragState.panelStartTop = rect.top;
  
  target.style.left = rect.left + 'px';
  target.style.top = rect.top + 'px';
  target.style.bottom = 'auto';
  target.style.transform = 'none';
}

function onPanelDrag(e) {
  if (!panelDragState.isDragging || !panelDragState.currentPanel) return;
  
  const panel = panelDragState.currentPanel;
  const dx = e.clientX - panelDragState.startX;
  const dy = e.clientY - panelDragState.startY;
  
  let newLeft = panelDragState.panelStartLeft + dx;
  let newTop = panelDragState.panelStartTop + dy;
  
  const w = panel.offsetWidth || 300;
  const h = panel.offsetHeight || 80;
  const maxLeft = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - h);
  
  newLeft = Math.max(0, Math.min(newLeft, maxLeft));
  newTop = Math.max(0, Math.min(newTop, maxTop));
  
  panel.style.left = newLeft + 'px';
  panel.style.top = newTop + 'px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = 'none';
}

function stopPanelDrag() {
  panelDragState.isDragging = false;
  panelDragState.currentPanel = null;
}

// ==================== 字母点击处理 ====================
let isColorDragging = false;
let dragTargetType = null; // 'letter' or 'phonetic'
let dragStartIndex = -1;

function handleLetterMouseDown(index, element) {
  const word = getCurrentWord();
  if (!word) return;
  
  element.classList.remove('bounce');
  void element.offsetWidth;
  element.classList.add('bounce');
  
  if (state.toolMode === 'color') {
    isColorDragging = true;
    dragTargetType = 'letter';
    dragStartIndex = index;
    // 保存撤销快照
    pushColorUndo();
    // 先标一个
    applyLetterColor(index, state.selectedColor);
  } else if (state.toolMode === 'split') {
    toggleSplitPoint(index);
  }
}

function handleLetterMouseEnter(index) {
  if (!isColorDragging || dragTargetType !== 'letter') return;
  if (state.toolMode !== 'color') return;
  applyLetterColorRange(dragStartIndex, index, state.selectedColor);
}

function handlePhoneticMouseDown(index, element) {
  const word = getCurrentWord();
  if (!word) return;
  
  element.classList.remove('bounce');
  void element.offsetWidth;
  element.classList.add('bounce');
  
  if (state.toolMode === 'color') {
    isColorDragging = true;
    dragTargetType = 'phonetic';
    dragStartIndex = index;
    pushColorUndo();
    applyPhoneticColor(index, state.selectedColor);
  }
}

function handlePhoneticMouseEnter(index) {
  if (!isColorDragging || dragTargetType !== 'phonetic') return;
  if (state.toolMode !== 'color') return;
  applyPhoneticColorRange(dragStartIndex, index, state.selectedColor);
}

document.addEventListener('mouseup', () => {
  if (isColorDragging) {
    isColorDragging = false;
    dragTargetType = null;
    dragStartIndex = -1;
    saveData();
  }
});

// ==================== 标色功能 ====================
// 撤销历史栈（存储每个单词的 letterColors / phoneticColors 快照）
let colorUndoStack = [];

function pushColorUndo() {
  const word = getCurrentWord();
  if (!word) return;
  colorUndoStack.push({
    wordId: word.id,
    letterColors: JSON.parse(JSON.stringify(word.letterColors || [])),
    phoneticColors: JSON.parse(JSON.stringify(word.phoneticColors || []))
  });
  // 最多保留 30 步
  if (colorUndoStack.length > 30) colorUndoStack.shift();
}

function undoLastColor() {
  const word = getCurrentWord();
  if (!word) return;
  if (colorUndoStack.length === 0) return;
  
  // 找到当前单词最近的一条历史
  let targetIdx = -1;
  for (let i = colorUndoStack.length - 1; i >= 0; i--) {
    if (colorUndoStack[i].wordId === word.id) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1) return;
  
  const snapshot = colorUndoStack.splice(targetIdx, 1)[0];
  word.letterColors = snapshot.letterColors;
  word.phoneticColors = snapshot.phoneticColors;
  saveData();
  renderWordSpelling();
  renderPhonetic();
}

function applyLetterColor(index, color) {
  const word = getCurrentWord();
  if (!word) return;
  if (!word.letterColors) word.letterColors = [];
  
  const existingIndex = word.letterColors.findIndex(c => c.index === index);
  if (existingIndex !== -1) {
    word.letterColors[existingIndex].color = color;
  } else {
    word.letterColors.push({ index, color });
  }
  renderWordSpelling();
}

function applyLetterColorRange(fromIdx, toIdx, color) {
  const start = Math.min(fromIdx, toIdx);
  const end = Math.max(fromIdx, toIdx);
  const word = getCurrentWord();
  if (!word) return;
  if (!word.letterColors) word.letterColors = [];
  
  for (let i = start; i <= end; i++) {
    const existingIndex = word.letterColors.findIndex(c => c.index === i);
    if (existingIndex !== -1) {
      word.letterColors[existingIndex].color = color;
    } else {
      word.letterColors.push({ index: i, color });
    }
  }
  renderWordSpelling();
}

function applyPhoneticColor(index, color) {
  const word = getCurrentWord();
  if (!word) return;
  if (!word.phoneticColors) word.phoneticColors = [];
  
  const existingIndex = word.phoneticColors.findIndex(c => c.index === index);
  if (existingIndex !== -1) {
    word.phoneticColors[existingIndex].color = color;
  } else {
    word.phoneticColors.push({ index, color });
  }
  renderPhonetic();
}

function applyPhoneticColorRange(fromIdx, toIdx, color) {
  const start = Math.min(fromIdx, toIdx);
  const end = Math.max(fromIdx, toIdx);
  const word = getCurrentWord();
  if (!word) return;
  if (!word.phoneticColors) word.phoneticColors = [];
  
  for (let i = start; i <= end; i++) {
    const existingIndex = word.phoneticColors.findIndex(c => c.index === i);
    if (existingIndex !== -1) {
      word.phoneticColors[existingIndex].color = color;
    } else {
      word.phoneticColors.push({ index: i, color });
    }
  }
  renderPhonetic();
}

// 兼容原有的单击切换逻辑（用于非拖选场景，保留切换取消颜色的能力）
function toggleLetterColor(index) {
  const word = getCurrentWord();
  if (!word) return;
  if (!word.letterColors) word.letterColors = [];
  
  pushColorUndo();
  applyLetterColor(index, state.selectedColor);
  saveData();
}

function togglePhoneticColor(index) {
  const word = getCurrentWord();
  if (!word) return;
  if (!word.phoneticColors) word.phoneticColors = [];
  
  pushColorUndo();
  applyPhoneticColor(index, state.selectedColor);
  saveData();
}

function clearColors() {
  const word = getCurrentWord();
  if (!word) return;
  pushColorUndo();
  word.letterColors = [];
  word.phoneticColors = [];
  saveData();
  renderWordSpelling();
  renderPhonetic();
}

function selectColor(element) {
  document.querySelectorAll('#color-picker .color-circle').forEach(el => el.classList.remove('active'));
  element.classList.add('active');
  state.selectedColor = element.dataset.color;
}

// ==================== 切分功能 ====================
function toggleSplitPoint(index) {
  const word = getCurrentWord();
  if (!word) return;
  
  if (index >= word.word.length - 1) return;
  
  if (!word.splitPoints) word.splitPoints = [];
  
  const existingIndex = word.splitPoints.indexOf(index);
  if (existingIndex !== -1) {
    word.splitPoints.splice(existingIndex, 1);
  } else {
    word.splitPoints.push(index);
    word.splitPoints.sort((a, b) => a - b);
  }
  
  saveData();
  renderWordSpelling();
}

function clearSplits() {
  const word = getCurrentWord();
  if (!word) return;
  word.splitPoints = [];
  saveData();
  renderWordSpelling();
}

// ==================== 工具栏模式 ====================
function setToolMode(mode) {
  state.toolMode = mode;
  
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tool-${mode}`)?.classList.add('active');
  
  const colorWrapper = document.getElementById('color-panel-wrapper');
  const paintWrapper = document.getElementById('paint-panel-wrapper');
  colorWrapper.classList.toggle('hidden', mode !== 'color');
  paintWrapper.classList.toggle('hidden', mode !== 'paint');
  
  const canvas = document.getElementById('paint-canvas');
  canvas.classList.toggle('active', mode === 'paint');
  
  exitDictation();
}

// ==================== 听写功能 ====================
function startDictation() {
  const word = getCurrentWord();
  if (!word) return;

  // 清除已有拼读箭头
  clearPronounceArrows();

  document.getElementById('word-display').classList.add('hidden');
  document.getElementById('word-image').classList.add('hidden');
  document.getElementById('word-meaning').classList.add('hidden');
  document.getElementById('dictation-area').classList.remove('hidden');
  document.getElementById('dictation-input').value = '';
  document.getElementById('dictation-feedback').textContent = '';
  document.getElementById('dictation-feedback').className = 'mt-6 text-2xl font-bold h-10';
  
  setTimeout(() => {
    document.getElementById('dictation-input').focus();
  }, 100);
  
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('tool-dictation')?.classList.add('active');
  
  document.getElementById('color-panel').classList.add('hidden');
  document.getElementById('paint-panel').classList.add('hidden');
  
  state.dictationMode = 'submit';
  updateDictationBtn();
}

function exitDictation() {
  document.getElementById('word-display').classList.remove('hidden');
  document.getElementById('word-meaning').classList.remove('hidden');
  const word = getCurrentWord();
  if (word) updateWordImage(word);
  document.getElementById('dictation-area').classList.add('hidden');
}

function checkDictation(mode) {
  state.dictationMode = state.dictationMode === 'realtime' ? 'submit' : 'realtime';
  updateDictationBtn();
  
  if (state.dictationMode === 'realtime') {
    doRealtimeCheck();
  }
}

function updateDictationBtn() {
  const btn = document.getElementById('btn-realtime');
  if (state.dictationMode === 'realtime') {
    btn.textContent = '✓ 实时批改中';
    btn.style.background = '#E8F5E9';
    btn.style.borderColor = '#4CAF50';
    btn.style.color = '#2E7D32';
  } else {
    btn.textContent = '实时批改模式';
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

function doRealtimeCheck() {
  const word = getCurrentWord();
  if (!word) return;
  
  const input = document.getElementById('dictation-input');
  const value = input.value.toLowerCase();
  const target = word.word.toLowerCase();
  
  const feedback = document.getElementById('dictation-feedback');
  
  if (value.length === 0) {
    feedback.textContent = '';
    return;
  }
  
  let correctCount = 0;
  for (let i = 0; i < value.length && i < target.length; i++) {
    if (value[i] === target[i]) {
      correctCount++;
    }
  }
  
  if (value === target) {
    feedback.textContent = '🎉 完全正确！太棒了！';
    feedback.className = 'mt-6 text-2xl font-bold h-10 text-green-500';
  } else if (correctCount === value.length && value.length < target.length) {
    feedback.textContent = '✓ 到目前为止都正确，继续加油！';
    feedback.className = 'mt-6 text-2xl font-bold h-10 text-green-500';
  } else {
    feedback.textContent = '❌ 有错误，再想想~';
    feedback.className = 'mt-6 text-2xl font-bold h-10 text-red-500';
  }
}

function submitDictation() {
  const word = getCurrentWord();
  if (!word) return;
  
  const input = document.getElementById('dictation-input');
  const value = input.value.toLowerCase().trim();
  const target = word.word.toLowerCase();
  
  const feedback = document.getElementById('dictation-feedback');
  
  if (value === target) {
    feedback.textContent = '🎉 完全正确！太棒了！';
    feedback.className = 'mt-6 text-2xl font-bold h-10 text-green-500';
  } else {
    feedback.textContent = `❌ 正确答案是：${word.word}`;
    feedback.className = 'mt-6 text-2xl font-bold h-10 text-red-500';
  }
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'dictation-input' && state.dictationMode === 'realtime') {
    doRealtimeCheck();
  }
});

// ==================== 画笔功能 ====================
let paintCtx = null;
let isDrawing = false;
let startX = 0, startY = 0;
let currentPath = null;

function initPaintCanvas() {
  const canvas = document.getElementById('paint-canvas');
  paintCtx = canvas.getContext('2d');
  resizePaintCanvas();
  
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);
}

function resizePaintCanvas() {
  const canvas = document.getElementById('paint-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function startDrawing(e) {
  if (state.toolMode !== 'paint') return;
  
  isDrawing = true;
  const rect = e.target.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  
  if (state.paintShape === 'pen') {
    currentPath = [{ x: startX, y: startY }];
    paintCtx.beginPath();
    paintCtx.moveTo(startX, startY);
    paintCtx.strokeStyle = state.paintColor;
    paintCtx.lineWidth = state.paintSize;
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';
  }
}

function draw(e) {
  if (!isDrawing || state.toolMode !== 'paint') return;
  
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  if (state.paintShape === 'pen') {
    paintCtx.lineTo(x, y);
    paintCtx.stroke();
    currentPath.push({ x, y });
  } else {
    redrawPaint();
    drawShape(startX, startY, x, y);
  }
}

function stopDrawing(e) {
  if (!isDrawing) return;
  isDrawing = false;
  
  const rect = e.target.closest('canvas').getBoundingClientRect();
  const endX = e.clientX - rect.left;
  const endY = e.clientY - rect.top;
  
  if (state.paintShape !== 'pen') {
    state.paintHistory.push({
      type: state.paintShape,
      color: state.paintColor,
      size: state.paintSize,
      startX,
      startY,
      endX,
      endY
    });
  } else if (currentPath) {
    state.paintHistory.push({
      type: 'pen',
      color: state.paintColor,
      size: state.paintSize,
      path: [...currentPath]
    });
  }
  
  currentPath = null;
}

function drawShape(x1, y1, x2, y2) {
  paintCtx.strokeStyle = state.paintColor;
  paintCtx.lineWidth = state.paintSize;
  paintCtx.lineCap = 'round';
  
  if (state.paintShape === 'rect') {
    paintCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  } else if (state.paintShape === 'circle') {
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;
    const centerX = x1 + (x2 - x1) / 2;
    const centerY = y1 + (y2 - y1) / 2;
    paintCtx.beginPath();
    paintCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    paintCtx.stroke();
  } else if (state.paintShape === 'arrow') {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 20;
    
    paintCtx.beginPath();
    paintCtx.moveTo(x1, y1);
    paintCtx.lineTo(x2, y2);
    paintCtx.stroke();
    
    paintCtx.beginPath();
    paintCtx.moveTo(x2, y2);
    paintCtx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    paintCtx.moveTo(x2, y2);
    paintCtx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    paintCtx.stroke();
  }
}

function redrawPaint() {
  const canvas = document.getElementById('paint-canvas');
  paintCtx.clearRect(0, 0, canvas.width, canvas.height);
  
  state.paintHistory.forEach(item => {
    paintCtx.strokeStyle = item.color;
    paintCtx.lineWidth = item.size;
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';
    
    if (item.type === 'pen' && item.path) {
      paintCtx.beginPath();
      if (item.path.length > 0) {
        paintCtx.moveTo(item.path[0].x, item.path[0].y);
        for (let i = 1; i < item.path.length; i++) {
          paintCtx.lineTo(item.path[i].x, item.path[i].y);
        }
        paintCtx.stroke();
      }
    } else if (item.type !== 'pen') {
      drawShapeWithCtx(item.type, item.startX, item.startY, item.endX, item.endY, item.color, item.size);
    }
  });
}

function drawShapeWithCtx(type, x1, y1, x2, y2, color, size) {
  paintCtx.strokeStyle = color;
  paintCtx.lineWidth = size;
  paintCtx.lineCap = 'round';
  
  if (type === 'rect') {
    paintCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  } else if (type === 'circle') {
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;
    const centerX = x1 + (x2 - x1) / 2;
    const centerY = y1 + (y2 - y1) / 2;
    paintCtx.beginPath();
    paintCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    paintCtx.stroke();
  } else if (type === 'arrow') {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 20;
    
    paintCtx.beginPath();
    paintCtx.moveTo(x1, y1);
    paintCtx.lineTo(x2, y2);
    paintCtx.stroke();
    
    paintCtx.beginPath();
    paintCtx.moveTo(x2, y2);
    paintCtx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    paintCtx.moveTo(x2, y2);
    paintCtx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    paintCtx.stroke();
  }
}

function selectPaintColor(element) {
  document.querySelectorAll('#paint-color-picker .color-circle').forEach(el => el.classList.remove('active'));
  element.classList.add('active');
  state.paintColor = element.dataset.color;
}

function setPaintSize(element) {
  document.querySelectorAll('.paint-size-btn').forEach(btn => btn.classList.remove('active'));
  element.classList.add('active');
  state.paintSize = parseInt(element.dataset.size);
}

function setPaintShape(shape) {
  state.paintShape = shape;
  document.querySelectorAll('.paint-shape-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`shape-${shape}`)?.classList.add('active');
}

function undoPaint() {
  if (state.paintHistory.length > 0) {
    state.paintHistory.pop();
    redrawPaint();
  }
}

function clearPaint() {
  state.paintHistory = [];
  const canvas = document.getElementById('paint-canvas');
  paintCtx?.clearRect(0, 0, canvas.width, canvas.height);
}

// 兼容：clearPaintCanvas 别名
function clearPaintCanvas() {
  clearPaint();
}

// ==================== 拼读箭头 ====================
let pronounceArrowIdCounter = 0;
let arrowDragState = {
  isDragging: false,
  el: null,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0
};

function addPronounceArrow() {
  const container = document.getElementById('pronounce-arrows');
  if (!container) return;
  
  pronounceArrowIdCounter++;
  const id = 'pronounce-arrow-' + pronounceArrowIdCounter;
  
  const arrow = document.createElement('div');
  arrow.id = id;
  arrow.className = 'pronounce-arrow';
  arrow.dataset.scale = '1';
  arrow.style.left = (window.innerWidth / 2 - 120) + 'px';
  arrow.style.top = (window.innerHeight / 2 - 100) + 'px';
  
  arrow.innerHTML = `
    <div class="arrow-drag-handle" title="拖动移动">
      <svg viewBox="0 0 260 160" width="87" height="53" style="display:block;overflow:visible;">
        <defs>
          <marker id="arrowhead-${pronounceArrowIdCounter}" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L6,3 L0,6 L1.5,3 Z" fill="#dc2626"/>
          </marker>
        </defs>
        <path d="M30 50 Q130 140, 230 50"
          fill="none" stroke="#dc2626" stroke-width="14" stroke-linecap="round"
          marker-end="url(#arrowhead-${pronounceArrowIdCounter})"/>
      </svg>
    </div>
    <div class="arrow-controls">
      <button class="arrow-control-btn" onclick="event.stopPropagation(); rotatePronounceArrow('${id}', -15)" title="逆时针旋转">↺</button>
      <button class="arrow-control-btn" onclick="event.stopPropagation(); rotatePronounceArrow('${id}', 15)" title="顺时针旋转">↻</button>
      <button class="arrow-control-btn" onclick="event.stopPropagation(); scalePronounceArrow('${id}', -0.1)" title="缩小">－</button>
      <button class="arrow-control-btn" onclick="event.stopPropagation(); scalePronounceArrow('${id}', 0.1)" title="放大">＋</button>
      <button class="arrow-control-btn arrow-delete" onclick="event.stopPropagation(); removePronounceArrow('${id}')" title="删除">✕</button>
    </div>
  `;
  
  container.appendChild(arrow);
  
  // 默认隐藏控制条
  const controls = arrow.querySelector('.arrow-controls');
  controls.style.display = 'none';
  
  // 点击箭头显示控制条，并隐藏其他箭头的控制条
  arrow.addEventListener('mousedown', (e) => {
    if (e.target.closest('.arrow-controls') || e.target.closest('.arrow-control-btn')) return;
    e.stopPropagation();
    // 先隐藏所有控制条
    document.querySelectorAll('.pronounce-arrow .arrow-controls').forEach(c => c.style.display = 'none');
    // 显示当前箭头的控制条
    controls.style.display = 'flex';
  });
  
  // 绑定拖拽
  const handle = arrow.querySelector('.arrow-drag-handle');
  handle.addEventListener('mousedown', (e) => startArrowDrag(e, arrow));
}

// 点击页面其他地方隐藏所有箭头控制条
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.pronounce-arrow')) {
    document.querySelectorAll('.pronounce-arrow .arrow-controls').forEach(c => c.style.display = 'none');
  }
});

function startArrowDrag(e, el) {
  if (e.target.closest('.arrow-controls') || e.target.closest('.arrow-control-btn')) return;
  e.preventDefault();
  arrowDragState.isDragging = true;
  arrowDragState.el = el;
  arrowDragState.startX = e.clientX;
  arrowDragState.startY = e.clientY;
  arrowDragState.startLeft = parseInt(el.style.left || '0');
  arrowDragState.startTop = parseInt(el.style.top || '0');
}

document.addEventListener('mousemove', (e) => {
  if (!arrowDragState.isDragging || !arrowDragState.el) return;
  const dx = e.clientX - arrowDragState.startX;
  const dy = e.clientY - arrowDragState.startY;
  let newLeft = arrowDragState.startLeft + dx;
  let newTop = arrowDragState.startTop + dy;
  
  const w = arrowDragState.el.offsetWidth;
  const h = arrowDragState.el.offsetHeight;
  const maxLeft = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - h);
  newLeft = Math.max(0, Math.min(newLeft, maxLeft));
  newTop = Math.max(0, Math.min(newTop, maxTop));
  
  arrowDragState.el.style.left = newLeft + 'px';
  arrowDragState.el.style.top = newTop + 'px';
});

document.addEventListener('mouseup', () => {
  arrowDragState.isDragging = false;
  arrowDragState.el = null;
});

function rotatePronounceArrow(id, deg) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = parseFloat(el.dataset.rotation || '0');
  const next = cur + deg;
  el.dataset.rotation = next;
  updateArrowTransform(el);
}

function scalePronounceArrow(id, delta) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = parseFloat(el.dataset.scale || '1');
  const next = Math.max(0.3, Math.min(3, cur + delta));
  el.dataset.scale = next;
  updateArrowTransform(el);
}

function updateArrowTransform(el) {
  const rot = el.dataset.rotation || '0';
  const scale = el.dataset.scale || '1';
  el.style.transform = `rotate(${rot}deg) scale(${scale})`;
  el.style.transformOrigin = 'center center';
}

function removePronounceArrow(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function clearPronounceArrows() {
  const container = document.getElementById('pronounce-arrows');
  if (container) container.innerHTML = '';
}

// 切换详情页时清空箭头
const _origOpenWordDetail = openWordDetail;
openWordDetail = function(index) {
  clearPronounceArrows();
  return _origOpenWordDetail(index);
};

// 纯净模式下隐藏箭头控件
const _origTogglePureMode = togglePureMode;
togglePureMode = function() {
  _origTogglePureMode();
  const detailPage = document.getElementById('detail-page');
  const show = !state.isPureMode;
  document.querySelectorAll('.arrow-controls').forEach(el => {
    el.style.display = show ? 'flex' : 'none';
  });
  document.querySelectorAll('.arrow-drag-handle').forEach(el => {
    el.style.cursor = show ? 'grab' : 'default';
  });
};

// ==================== 纯净模式 ====================
function togglePureMode() {
  state.isPureMode = !state.isPureMode;
  const detailPage = document.getElementById('detail-page');
  detailPage.classList.toggle('pure-mode', state.isPureMode);
  
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('tool-normal')?.classList.add('active');
}

// ==================== 导入功能 ====================
function openImportModal() {
  document.getElementById('import-modal').classList.remove('hidden');
  state.importBuffer = [];
  document.getElementById('import-preview').classList.add('hidden');
  switchImportTab('excel');
}

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
}

function switchImportTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  
  document.querySelectorAll('.import-tab').forEach(el => el.classList.add('hidden'));
  document.getElementById(`import-${tab}`)?.classList.remove('hidden');
}

// 清理字符串：去除首尾所有空白（含全角空格\u2003、不间断空格\u00A0等），中间多个空白合并为单个普通空格
function cleanStr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/[\u200B\uFEFF]/g, '')          // 去掉零宽空格、BOM
    .replace(/[\u2002\u2003\u2009\u200A\u00A0\u3000]/g, ' ')  // 全角/特殊空格 → 普通空格
    .replace(/[ \t]+/g, ' ')                 // 多个空格/Tab → 单个空格
    .replace(/^[ \n\r]+/, '')                // 去首尾换行/空格
    .replace(/[ \n\r]+$/, '');
}

function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
    
    let lastBook = '';
    state.importBuffer = jsonData.map((row, index) => {
      let word = cleanStr(row['单词'] || row['word'] || row['Word'] || '');
      let meaning = cleanStr(row['中文'] || row['释义'] || row['meaning'] || '');
      let phonetic = cleanStr(row['音标'] || row['phonetic'] || '');
      let partOfSpeech = cleanStr(row['词性'] || row['pos'] || '');
      let book = cleanStr(row['书本'] || row['book'] || row['Book'] || '');
      let unit = cleanStr(row['单元'] || row['unit'] || '');
      let lesson = cleanStr(row['课'] || row['lesson'] || '');
      
      // 向下填充书本：如果当前行书本为空，沿用上行的书本
      if (book) {
        lastBook = book;
      } else {
        book = lastBook;
      }
      
      // 处理特殊情况：单词列里用 \u2003 塞了 单词/音标/词性/中文（中文列为空）
      if (!meaning && word.indexOf('\u2003') >= 0) {
        const parts = word.split(/\u2003+/).map(p => cleanStr(p)).filter(p => p);
        if (parts.length >= 2) {
          word = parts[0];
          // 第1段如果含空格且空格后以 / 开头，说明音标塞在单词后面，如 "may /meɪ/"
          const spaceIdx = word.indexOf(' ');
          if (spaceIdx > 0 && word.charAt(spaceIdx + 1) === '/') {
            phonetic = word.substring(spaceIdx + 1);
            word = word.substring(0, spaceIdx);
          }
          // 第2段如果以 / 开头就是音标
          let i = 1;
          if (parts[i] && parts[i].charAt(0) === '/') {
            phonetic = parts[i];
            i++;
          }
          // 剩下的最后一段是中文，倒数第二段可能是词性
          const remaining = parts.slice(i);
          if (remaining.length >= 2) {
            const secondLast = remaining[remaining.length - 2];
            if (secondLast.match(/[a-z]+\./i) || secondLast.indexOf('词') >= 0 || secondLast === '短语') {
              partOfSpeech = secondLast;
              meaning = remaining[remaining.length - 1];
            } else {
              meaning = remaining.join(' ');
            }
          } else if (remaining.length === 1) {
            meaning = remaining[0];
          }
        }
      }
      
      // 单元如果是纯数字，统一加 "Unit " 前缀，保持和示例数据一致
      if (unit && /^\d+$/.test(unit)) {
        unit = 'Unit ' + unit;
      }
      
      return {
        id: `import-${Date.now()}-${index}`,
        word,
        meaning,
        partOfSpeech,
        phonetic,
        book,
        unit: unit || '未分组',
        lesson,
        tags: [],
        letterColors: [],
        phoneticColors: [],
        splitPoints: [],
        imageUrl: '',
        order: state.words.length + index + 1
      };
    }).filter(w => w.word && w.meaning);
    
    showImportPreview();
  };
  reader.readAsArrayBuffer(file);
}

function previewImport() {
  const activeTab = document.querySelector('.tab-btn.active')?.id?.replace('tab-', '');
  
  if (activeTab === 'text') {
    const text = document.getElementById('text-import').value.trim();
    if (!text) {
      alert('请输入要导入的文本');
      return;
    }
    
    const lines = text.split('\n').filter(line => line.trim());
    state.importBuffer = lines.map((line, index) => {
      const parts = line.split(/[\t ]+/).filter(p => p.trim());
      return {
        id: `import-${Date.now()}-${index}`,
        word: parts[0] || '',
        phonetic: parts[1]?.startsWith('/') ? parts[1] : '',
        partOfSpeech: parts[1]?.startsWith('/') ? (parts[2] || '') : (parts[1] || ''),
        meaning: parts[1]?.startsWith('/') ? (parts.slice(3).join(' ') || '') : (parts.slice(2).join(' ') || ''),
        book: '',
        unit: '未分组',
        lesson: '',
        tags: [],
        letterColors: [],
        splitPoints: [],
        imageUrl: '',
        order: state.words.length + index + 1
      };
    }).filter(w => w.word && w.meaning);
    
    showImportPreview();
  } else if (activeTab === 'manual') {
    const word = document.getElementById('manual-word').value.trim();
    const meaning = document.getElementById('manual-meaning').value.trim();
    
    if (!word || !meaning) {
      alert('请填写单词和中文释义');
      return;
    }
    
    state.importBuffer = [{
      id: `import-${Date.now()}-0`,
      word,
      phonetic: document.getElementById('manual-phonetic').value.trim(),
      partOfSpeech: document.getElementById('manual-pos').value.trim(),
      meaning,
      book: document.getElementById('manual-book').value.trim(),
      unit: document.getElementById('manual-unit').value.trim() || '未分组',
      lesson: document.getElementById('manual-lesson').value.trim(),
      tags: [],
      letterColors: [],
      splitPoints: [],
      imageUrl: '',
      order: state.words.length + 1
    }];
    
    showImportPreview();
  }
}

function showImportPreview() {
  const previewDiv = document.getElementById('import-preview');
  const tbody = document.getElementById('preview-body');
  const count = document.getElementById('preview-count');
  
  count.textContent = state.importBuffer.length;
  
  let html = '';
  state.importBuffer.slice(0, 10).forEach(w => {
    html += `
      <tr class="border-b border-gray-100">
        <td class="px-4 py-2 font-medium">${w.word}</td>
        <td class="px-4 py-2 text-gray-500">${w.phonetic || '-'}</td>
        <td class="px-4 py-2 text-orange-500">${w.partOfSpeech || '-'}</td>
        <td class="px-4 py-2">${w.meaning}</td>
      </tr>
    `;
  });
  
  if (state.importBuffer.length > 10) {
    html += `<tr><td colspan="4" class="px-4 py-2 text-center text-gray-400">... 还有 ${state.importBuffer.length - 10} 个单词</td></tr>`;
  }
  
  tbody.innerHTML = html;
  previewDiv.classList.remove('hidden');
}

function confirmImport() {
  if (state.importBuffer.length === 0) {
    previewImport();
    if (state.importBuffer.length === 0) return;
  }
  
  state.words = [...state.words, ...state.importBuffer];
  updateFilters();
  saveData();
  renderBookTags();
  renderUnitTags();
  renderLessonTags();
  renderWordTable();
  closeImportModal();
  
  alert(`成功导入 ${state.importBuffer.length} 个单词！`);
}

// ==================== 导出功能 ====================
function exportWord() {
  document.getElementById('export-modal').classList.remove('hidden');
}

function closeExportModal() {
  document.getElementById('export-modal').classList.add('hidden');
}

async function exportAsImage() {
  closeExportModal();
  
  const content = document.getElementById('word-content');
  const wasPure = state.isPureMode;
  
  if (!wasPure) {
    state.isPureMode = true;
    document.getElementById('detail-page').classList.add('pure-mode');
  }
  
  await new Promise(r => setTimeout(r, 300));
  
  try {
    const canvas = await html2canvas(content, {
      backgroundColor: '#FFF9F0',
      scale: 2
    });
    
    const link = document.createElement('a');
    link.download = `${getCurrentWord()?.word || 'word'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    alert('导出失败：' + e.message);
  }
  
  if (!wasPure) {
    state.isPureMode = false;
    document.getElementById('detail-page').classList.remove('pure-mode');
  }
}

async function exportAsPDF() {
  closeExportModal();
  
  const content = document.getElementById('word-content');
  const wasPure = state.isPureMode;
  
  if (!wasPure) {
    state.isPureMode = true;
    document.getElementById('detail-page').classList.add('pure-mode');
  }
  
  await new Promise(r => setTimeout(r, 300));
  
  try {
    const canvas = await html2canvas(content, {
      backgroundColor: '#FFF9F0',
      scale: 2
    });
    
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });
    
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${getCurrentWord()?.word || 'word'}.pdf`);
  } catch (e) {
    alert('导出失败：' + e.message);
  }
  
  if (!wasPure) {
    state.isPureMode = false;
    document.getElementById('detail-page').classList.remove('pure-mode');
  }
}

function downloadTemplate() {
  const data = [
    ['单词', '中文', '词性', '音标', '书本', '单元', '课'],
    ['teacher', '老师', 'n.', '/ˈtiːtʃə(r)/', '人教版三年级上册', 'Unit 1', 'Lesson 1'],
    ['apple', '苹果', 'n.', '/ˈæpl/', '人教版三年级上册', 'Unit 1', 'Lesson 2'],
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '单词表');
  XLSX.writeFile(wb, '单词导入模板.xlsx');
}

// ==================== 编辑弹窗 ====================
let editModalState = {
  type: 'book',
  mode: 'add',
  currentValue: '',
  wordId: null
};

function openEditModal(type, mode, value, wordId) {
  editModalState = { type, mode, currentValue: value || '', wordId: wordId || null };
  
  const modal = document.getElementById('edit-modal');
  const title = document.getElementById('edit-modal-title');
  const form = document.getElementById('edit-modal-form');
  const confirmBtn = document.getElementById('edit-confirm-btn');
  
  const typeNames = {
    book: '书本',
    unit: '单元',
    lesson: '课',
    word: '单词'
  };
  
  if (type === 'word') {
    title.textContent = '编辑单词';
    confirmBtn.textContent = '保存';
    confirmBtn.className = 'btn-primary flex-1 py-3';
    
    const word = state.words.find(w => w.id === wordId);
    if (!word) return;
    
    form.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">
          <label class="block text-sm font-bold text-gray-700 mb-1">单词 *</label>
          <input type="text" id="edit-word" value="${word.word.replace(/"/g, '&quot;')}" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-orange-400 focus:outline-none">
        </div>
        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1">音标</label>
          <input type="text" id="edit-phonetic" value="${(word.phonetic || '').replace(/"/g, '&quot;')}" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-orange-400 focus:outline-none" placeholder="/həˈləʊ/">
        </div>
        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1">词性</label>
          <input type="text" id="edit-pos" value="${(word.partOfSpeech || '').replace(/"/g, '&quot;')}" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-orange-400 focus:outline-none" placeholder="n. / 短语">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-bold text-gray-700 mb-1">中文释义 *</label>
          <input type="text" id="edit-meaning" value="${(word.meaning || '').replace(/"/g, '&quot;')}" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-orange-400 focus:outline-none">
        </div>
        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1">书本</label>
          <input type="text" id="edit-book" value="${(word.book || '').replace(/"/g, '&quot;')}" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-orange-400 focus:outline-none">
        </div>
        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1">单元</label>
          <input type="text" id="edit-unit" value="${(word.unit || '').replace(/"/g, '&quot;')}" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-orange-400 focus:outline-none">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-bold text-gray-700 mb-1">课</label>
          <input type="text" id="edit-lesson" value="${(word.lesson || '').replace(/"/g, '&quot;')}" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-orange-400 focus:outline-none">
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('edit-word').focus(), 100);
    return;
  }
  
  if (mode === 'add') {
    title.textContent = `新增${typeNames[type]}`;
    confirmBtn.textContent = '添加';
    confirmBtn.className = 'btn-primary flex-1 py-3';
  } else if (mode === 'delete') {
    title.textContent = `删除${typeNames[type]}`;
    confirmBtn.textContent = '确认删除';
    confirmBtn.className = 'flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all';
  }
  
  if (mode === 'add') {
    let placeholder = '';
    if (type === 'book') placeholder = '例如：人教版三年级上册';
    if (type === 'unit') placeholder = '例如：Unit 1';
    if (type === 'lesson') placeholder = '例如：Lesson 1';
    
    form.innerHTML = `
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-2">${typeNames[type]}名称</label>
        <input type="text" id="edit-input" class="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-orange-400 focus:outline-none" placeholder="${placeholder}">
      </div>
      ${type !== 'book' ? `
      <div class="p-3 bg-gray-50 rounded-xl text-sm text-gray-500">
        <p>将在「${state.currentBook || '全部'}」${type === 'lesson' ? `·「${state.currentUnit || '全部'}」` : ''}下添加</p>
      </div>` : ''}
    `;
  } else if (mode === 'delete') {
    form.innerHTML = `
      <div class="p-4 bg-red-50 rounded-xl">
        <p class="text-red-700 font-bold mb-2">⚠️ 确定要删除吗？</p>
        <p class="text-sm text-red-600">删除「${value}」后，该${typeNames[type]}下的所有单词都会被一起删除，此操作不可撤销。</p>
      </div>
    `;
  }
  
  modal.classList.remove('hidden');
  
  if (mode === 'add') {
    setTimeout(() => {
      document.getElementById('edit-input').focus();
    }, 100);
  }
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

function confirmEdit() {
  const { type, mode, currentValue, wordId } = editModalState;
  
  // 编辑单词
  if (type === 'word' && wordId) {
    const word = state.words.find(w => w.id === wordId);
    if (!word) return;
    
    const newWord = document.getElementById('edit-word').value.trim();
    const newMeaning = document.getElementById('edit-meaning').value.trim();
    if (!newWord || !newMeaning) {
      alert('单词和中文释义不能为空');
      return;
    }
    
    word.word = cleanStr(newWord);
    word.meaning = cleanStr(newMeaning);
    word.phonetic = cleanStr(document.getElementById('edit-phonetic').value);
    word.partOfSpeech = cleanStr(document.getElementById('edit-pos').value);
    word.book = cleanStr(document.getElementById('edit-book').value);
    word.unit = cleanStr(document.getElementById('edit-unit').value) || '未分组';
    word.lesson = cleanStr(document.getElementById('edit-lesson').value);
    
    updateFilters();
    saveData();
    renderBookTags();
    renderUnitTags();
    renderLessonTags();
    renderWordTable();
    closeEditModal();
    return;
  }
  
  if (mode === 'add') {
    const input = document.getElementById('edit-input');
    const name = input.value.trim();
    if (!name) {
      alert('请输入名称');
      return;
    }
    
    const newWord = {
      id: `word-${Date.now()}`,
      word: '示例单词',
      meaning: '示例释义',
      partOfSpeech: 'n.',
      phonetic: '',
      book: type === 'book' ? name : (state.currentBook || ''),
      unit: type === 'unit' ? name : (state.currentUnit || ''),
      lesson: type === 'lesson' ? name : (state.currentLesson || ''),
      tags: [],
      letterColors: [],
      phoneticColors: [],
      splitPoints: [],
      imageUrl: '',
      order: state.words.length + 1
    };
    
    state.words.push(newWord);
    
    if (type === 'book') {
      state.currentBook = name;
      state.currentUnit = null;
      state.currentLesson = null;
    } else if (type === 'unit') {
      state.currentUnit = name;
      state.currentLesson = null;
    } else if (type === 'lesson') {
      state.currentLesson = name;
    }
    
    updateFilters();
    saveData();
    renderBookTags();
    renderUnitTags();
    renderLessonTags();
    renderWordTable();
    updateEditButtons();
    closeEditModal();
  } else if (mode === 'delete') {
    if (type === 'book') {
      state.words = state.words.filter(w => w.book !== currentValue);
      state.currentBook = null;
      state.currentUnit = null;
      state.currentLesson = null;
    } else if (type === 'unit') {
      state.words = state.words.filter(w => {
        if (state.currentBook && w.book !== state.currentBook) return true;
        return w.unit !== currentValue;
      });
      state.currentUnit = null;
      state.currentLesson = null;
    } else if (type === 'lesson') {
      state.words = state.words.filter(w => {
        if (state.currentBook && w.book !== state.currentBook) return true;
        if (state.currentUnit && w.unit !== state.currentUnit) return true;
        return w.lesson !== currentValue;
      });
      state.currentLesson = null;
    }
    
    updateFilters();
    saveData();
    renderBookTags();
    renderUnitTags();
    renderLessonTags();
    renderWordTable();
    updateEditButtons();
    closeEditModal();
  }
}

// ==================== 编辑功能 ====================
function addBook() {
  openEditModal('book', 'add');
}

function deleteCurrentBook() {
  if (!state.currentBook) return;
  openEditModal('book', 'delete', state.currentBook);
}

function addUnit() {
  openEditModal('unit', 'add');
}

function deleteCurrentUnit() {
  if (!state.currentUnit) return;
  openEditModal('unit', 'delete', state.currentUnit);
}

function addLesson() {
  openEditModal('lesson', 'add');
}

function deleteCurrentLesson() {
  if (!state.currentLesson) return;
  openEditModal('lesson', 'delete', state.currentLesson);
}

function addWordManually() {
  openImportModal();
  switchImportTab('manual');
  
  if (state.currentBook) {
    setTimeout(() => {
      document.getElementById('manual-book').value = state.currentBook;
    }, 100);
  }
  if (state.currentUnit) {
    setTimeout(() => {
      document.getElementById('manual-unit').value = state.currentUnit;
    }, 100);
  }
  if (state.currentLesson) {
    setTimeout(() => {
      document.getElementById('manual-lesson').value = state.currentLesson;
    }, 100);
  }
}

function deleteWord(id, event) {
  event.stopPropagation();
  if (!confirm('确定要删除这个单词吗？')) return;
  
  state.words = state.words.filter(w => w.id !== id);
  updateFilters();
  saveData();
  renderBookTags();
  renderUnitTags();
  renderLessonTags();
  renderWordTable();
}

function updateEditButtons() {
  const deleteBookBtn = document.getElementById('btn-delete-book');
  const addUnitBtn = document.getElementById('btn-add-unit');
  const deleteUnitBtn = document.getElementById('btn-delete-unit');
  const addLessonBtn = document.getElementById('btn-add-lesson');
  const deleteLessonBtn = document.getElementById('btn-delete-lesson');
  
  deleteBookBtn.style.display = state.currentBook ? 'flex' : 'none';
  addUnitBtn.style.display = state.currentBook ? 'flex' : 'none';
  deleteUnitBtn.style.display = state.currentUnit ? 'flex' : 'none';
  addLessonBtn.style.display = state.currentUnit ? 'flex' : 'none';
  deleteLessonBtn.style.display = state.currentLesson ? 'flex' : 'none';
}

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', () => {
  init();
  updateEditButtons();
  loadSyncConfig();
});

// ==================== 云同步（Gitee） ====================
const SYNC_CONFIG_KEY = 'word-teacher-sync-config';
const SYNC_DATA_FILE = 'word-data.json';
const GITEE_API_BASE = 'https://gitee.com/api/v5';

function openSyncModal() {
  loadSyncConfig();
  document.getElementById('sync-modal').classList.remove('hidden');
  hideSyncStatus();
}

function closeSyncModal() {
  document.getElementById('sync-modal').classList.add('hidden');
}

function loadSyncConfig() {
  const saved = localStorage.getItem(SYNC_CONFIG_KEY);
  if (saved) {
    try {
      const config = JSON.parse(saved);
      document.getElementById('sync-username').value = config.username || '';
      document.getElementById('sync-repo').value = config.repo || '';
      document.getElementById('sync-token').value = config.token || '';
    } catch (e) {}
  }
}

function getSyncConfig() {
  return {
    username: document.getElementById('sync-username').value.trim(),
    repo: document.getElementById('sync-repo').value.trim(),
    token: document.getElementById('sync-token').value.trim()
  };
}

function saveSyncConfig() {
  const config = getSyncConfig();
  if (!config.username || !config.repo || !config.token) {
    showSyncStatus('请填写完整的用户名、仓库名和Token', 'error');
    return;
  }
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  showSyncStatus('✅ 设置已保存', 'success');
}

function showSyncStatus(msg, type) {
  const el = document.getElementById('sync-status');
  el.classList.remove('hidden');
  el.classList.remove('bg-green-50', 'text-green-700', 'bg-red-50', 'text-red-700', 'bg-blue-50', 'text-blue-700');
  if (type === 'success') {
    el.classList.add('bg-green-50', 'text-green-700');
  } else if (type === 'error') {
    el.classList.add('bg-red-50', 'text-red-700');
  } else {
    el.classList.add('bg-blue-50', 'text-blue-700');
  }
  el.textContent = msg;
}

function hideSyncStatus() {
  document.getElementById('sync-status').classList.add('hidden');
}

async function testGiteeConnection() {
  const config = getSyncConfig();
  if (!config.username || !config.repo || !config.token) {
    showSyncStatus('请先填写完整信息再测试', 'error');
    return;
  }
  showSyncStatus('⏳ 正在测试连接...', 'info');
  try {
    const res = await fetch(`${GITEE_API_BASE}/repos/${config.username}/${config.repo}`, {
      headers: { 'Authorization': `token ${config.token}` }
    });
    if (res.ok) {
      showSyncStatus('✅ 连接成功！仓库存在且Token有效', 'success');
      saveSyncConfig();
    } else {
      const data = await res.json().catch(() => ({}));
      showSyncStatus(`❌ 连接失败：${data.message || res.status + ' ' + res.statusText}`, 'error');
    }
  } catch (e) {
    showSyncStatus(`❌ 连接失败：${e.message}`, 'error');
  }
}

async function getGiteeFileSha(config) {
  const res = await fetch(`${GITEE_API_BASE}/repos/${config.username}/${config.repo}/contents/${SYNC_DATA_FILE}`, {
    headers: { 'Authorization': `token ${config.token}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取文件失败：${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function uploadToCloud() {
  const config = getSyncConfig();
  if (!config.username || !config.repo || !config.token) {
    showSyncStatus('请先填写配置并保存', 'error');
    return;
  }
  saveSyncConfig();
  showSyncStatus('⏳ 正在上传...', 'info');
  try {
    const payload = {
      words: state.words,
      exportTime: new Date().toISOString(),
      version: 1
    };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
    
    let url = `${GITEE_API_BASE}/repos/${config.username}/${config.repo}/contents/${SYNC_DATA_FILE}`;
    let method = 'POST';
    const bodyData = {
      message: `update word data ${new Date().toLocaleString('zh-CN')}`,
      content: content
    };
    
    const existingSha = await getGiteeFileSha(config);
    if (existingSha) {
      method = 'PUT';
      bodyData.sha = existingSha;
    }
    
    const res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `token ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyData)
    });
    
    if (res.ok) {
      showSyncStatus('✅ 上传成功！数据已保存到 Gitee', 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      showSyncStatus(`❌ 上传失败：${data.message || res.statusText}`, 'error');
    }
  } catch (e) {
    showSyncStatus(`❌ 上传失败：${e.message}`, 'error');
  }
}

async function downloadFromCloud() {
  const config = getSyncConfig();
  if (!config.username || !config.repo || !config.token) {
    showSyncStatus('请先填写配置并保存', 'error');
    return;
  }
  saveSyncConfig();
  
  if (!confirm('确定要用云端数据覆盖本地吗？本地未上传的修改会丢失。')) {
    return;
  }
  
  showSyncStatus('⏳ 正在下载...', 'info');
  try {
    const res = await fetch(`${GITEE_API_BASE}/repos/${config.username}/${config.repo}/contents/${SYNC_DATA_FILE}`, {
      headers: { 'Authorization': `token ${config.token}` }
    });
    
    if (res.status === 404) {
      showSyncStatus('⚠️ 云端还没有数据文件，请先上传一次', 'error');
      return;
    }
    if (!res.ok) throw new Error(`下载失败：${res.status}`);
    
    const data = await res.json();
    const jsonStr = decodeURIComponent(escape(atob(data.content)));
    const payload = JSON.parse(jsonStr);
    
    if (!payload.words || !Array.isArray(payload.words)) {
      throw new Error('数据格式不正确');
    }
    
    state.words = payload.words.map((w, idx) => {
      if (!w.id) w.id = 'word-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      if (!w.tags) w.tags = [];
      if (!w.letterColors) w.letterColors = [];
      if (!w.phoneticColors) w.phoneticColors = [];
      if (!w.splitPoints) w.splitPoints = [];
      if (!w.imageUrl) w.imageUrl = '';
      if (w.order == null) w.order = idx + 1;
      return w;
    });
    
    saveData();
    state.currentBook = null;
    state.currentUnit = null;
    state.currentLesson = null;
    updateFilters();
    renderBookTags();
    renderUnitTags();
    renderLessonTags();
    renderWordTable();
    updateEditButtons();
    
    showSyncStatus(`✅ 下载成功！已导入 ${state.words.length} 个单词`, 'success');
  } catch (e) {
    showSyncStatus(`❌ 下载失败：${e.message}`, 'error');
  }
}

// ==================== 自动同步辅助函数 ====================

// 读取已保存的同步配置（不依赖 DOM 输入框）
function getSavedSyncConfig() {
  const saved = localStorage.getItem(SYNC_CONFIG_KEY);
  if (!saved) return null;
  try {
    const c = JSON.parse(saved);
    if (c && c.username && c.repo && c.token) return c;
  } catch (e) {}
  return null;
}

// 是否配置了同步信息
function hasSyncConfig() {
  return !!getSavedSyncConfig();
}

// 轻量 Toast 提示（右上角小提示，不打断用户）
function showSyncToast(msg) {
  let el = document.getElementById('sync-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-toast';
    el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;background:white;padding:10px 18px;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,0.12);font-size:14px;font-weight:600;max-width:320px;transition:all 0.3s ease;opacity:0;transform:translateY(-10px);';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  if (msg.includes('✅') || msg.includes('成功') || msg.includes('已同步')) {
    el.style.background = '#ECFDF5';
    el.style.color = '#047857';
    el.style.border = '1px solid #A7F3D0';
  } else if (msg.includes('⚠️') || msg.includes('跳过') || msg.includes('无更新')) {
    el.style.background = '#FFFBEB';
    el.style.color = '#92400E';
    el.style.border = '1px solid #FDE68A';
  } else if (msg.includes('❌') || msg.includes('失败')) {
    el.style.background = '#FEF2F2';
    el.style.color = '#B91C1C';
    el.style.border = '1px solid #FECACA';
  } else {
    el.style.background = '#EFF6FF';
    el.style.color = '#1D4ED8';
    el.style.border = '1px solid #BFDBFE';
  }
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
  }, 3000);
}

// 静默上传（不弹窗，失败自动重试）
async function autoUploadToCloud() {
  const config = getSavedSyncConfig();
  if (!config || state.syncingUpload) return;

  state.syncingUpload = true;
  try {
    const payload = {
      words: state.words,
      exportTime: new Date().toISOString(),
      lastModified: Date.now(),
      version: 2
    };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));

    let url = `${GITEE_API_BASE}/repos/${config.username}/${config.repo}/contents/${SYNC_DATA_FILE}`;
    let method = 'POST';
    const bodyData = {
      message: `sync: auto ${new Date().toLocaleString('zh-CN')}`,
      content: content
    };

    const existingSha = await getGiteeFileSha(config);
    if (existingSha) {
      method = 'PUT';
      bodyData.sha = existingSha;
    }

    const res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `token ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyData)
    });

    if (res.ok) {
      state.lastCloudModified = Date.now();
      showSyncToast('☁️ 已自动同步到云端');
    }
  } catch (e) {
    // 静默失败，不打扰用户，下次 saveData 会自动重试
  } finally {
    state.syncingUpload = false;
  }
}

// 静默下载
// - silent=true: 无更新不提示（用于轮询和初始化）
// - silent=false: 总是提示结果
async function autoDownloadFromCloud(silent) {
  const config = getSavedSyncConfig();
  if (!config || state.syncingDownload) return;

  state.syncingDownload = true;
  try {
    const res = await fetch(`${GITEE_API_BASE}/repos/${config.username}/${config.repo}/contents/${SYNC_DATA_FILE}`, {
      headers: { 'Authorization': `token ${config.token}` }
    });

    if (res.status === 404) {
      if (!silent) showSyncToast('⚠️ 云端暂无数据，请先上传');
      return;
    }
    if (!res.ok) return;

    const data = await res.json();
    const jsonStr = decodeURIComponent(escape(atob(data.content)));
    const payload = JSON.parse(jsonStr);

    if (!payload.words || !Array.isArray(payload.words)) return;

    const cloudModified = payload.lastModified || 0;

    // ---- 简单冲突处理：谁更新用谁 ----
    // 如果云端不比已知的云端版本新，跳过
    if (silent && cloudModified <= state.lastCloudModified) {
      return;
    }
    // 如果本地更新时间 > 云端更新时间，说明本地还没上传完，跳过（等本地自动上传覆盖云端）
    if (cloudModified < state.lastLocalSaved && state.lastLocalSaved > 0) {
      return;
    }

    // 应用云端数据
    state.words = payload.words.map((w, idx) => {
      if (!w.id) w.id = 'word-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      if (!w.tags) w.tags = [];
      if (!w.letterColors) w.letterColors = [];
      if (!w.phoneticColors) w.phoneticColors = [];
      if (!w.splitPoints) w.splitPoints = [];
      if (!w.imageUrl) w.imageUrl = '';
      if (w.order == null) w.order = idx + 1;
      return w;
    });

    state.lastCloudModified = cloudModified;
    state.lastLocalSaved = cloudModified;

    // 直接写 localStorage（不调用 saveData，避免触发自动上传导致循环）
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ words: state.words }));

    state.currentBook = null;
    state.currentUnit = null;
    state.currentLesson = null;
    updateFilters();
    renderBookTags();
    renderUnitTags();
    renderLessonTags();
    renderWordTable();
    updateEditButtons();

    showSyncToast(`⬇️ 已同步最新数据（${state.words.length} 个单词）`);
  } catch (e) {
    // 静默失败
  } finally {
    state.syncingDownload = false;
  }
}

// 启动 30 秒轮询检查云端更新
function startAutoPoll() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    autoDownloadFromCloud(true);
  }, 30000);
}

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', () => {
  init();
  updateEditButtons();
  loadSyncConfig();
});
