/**
 * CommitDay - Dashboard de Monitoramento Diário de Commits no GitLab
 * Lógica principal da aplicação
 */

// Chaves do localStorage
const STORAGE_KEYS = {
  DEVS: 'commitday_developers',
  PROJECTS: 'commitday_projects',
  SELECTED_PROJECT: 'commitday_selected_project_id',
  CONFIG: 'commitday_gitlab_config',
  MODE: 'commitday_data_mode'
};

// Desenvolvedores padrão para o Modo Demo
const DEFAULT_DEMO_DEVS = [
  { id: 'dev-1', name: 'Ana Silva', email: 'ana.silva@empresa.com', username: 'anasilva', team: 'Squad Checkout', projectIds: ['proj-1', 'proj-2'] },
  { id: 'dev-2', name: 'Bruno Costa', email: 'bruno.costa@empresa.com', username: 'brunocosta', team: 'Squad Backend', projectIds: ['proj-1', 'proj-3'] },
  { id: 'dev-3', name: 'Carla Mendes', email: 'carla.mendes@empresa.com', username: 'carlamendes', team: 'Squad Frontend', projectIds: ['proj-1'] },
  { id: 'dev-4', name: 'Diego Oliveira', email: 'diego.oliveira@empresa.com', username: 'diegooliveira', team: 'Squad Mobile', projectIds: ['proj-2'] },
  { id: 'dev-5', name: 'Elena Rostova', email: 'elena.rostova@empresa.com', username: 'elenarostova', team: 'Squad DevOps', projectIds: ['proj-3'] },
  { id: 'dev-6', name: 'Felipe Santos', email: 'felipe.santos@empresa.com', username: 'felipesantos', team: 'Squad Core', projectIds: ['proj-3'] }
];

// Projetos padrão para o Modo Demo
const DEFAULT_DEMO_PROJECTS = [
  { id: 'proj-1', name: 'Plataforma E-commerce', description: 'Sistema principal de vendas e checkout', gitlabProjectId: '101', gitlabUrl: '', gitlabToken: '', allBranches: true, devIds: ['dev-1', 'dev-2', 'dev-3'] },
  { id: 'proj-2', name: 'App Mobile Core', description: 'Aplicativo iOS/Android dos clientes', gitlabProjectId: '102', gitlabUrl: '', gitlabToken: '', allBranches: true, devIds: ['dev-1', 'dev-4'] },
  { id: 'proj-3', name: 'Infraestrutura & Cloud', description: 'Automação CI/CD e Kubernetes', gitlabProjectId: '103', gitlabUrl: '', gitlabToken: '', allBranches: true, devIds: ['dev-2', 'dev-5', 'dev-6'] }
];

// Estado da Aplicação
const state = {
  mode: 'demo', // 'demo' | 'gitlab'
  periodDays: 30,
  searchTerm: '',
  statusFilter: 'all',
  selectedProjectId: 'all', // 'all' ou ID do projeto
  projects: [],
  developers: [],
  gitlabConfig: {
    url: 'https://gitlab.com',
    token: '',
    projectId: ''
  },
  commitData: {}, // Map<devId, Map<dateString, commitCount>>
  commitStats: {}, // Map<devId, Map<dateString, { count, additions, deletions, netLines, outliers }>>
  productivitySettings: {
    metric: 'netLines', // 'netLines' | 'additions' | 'commits'
    viewMode: 'daily', // 'daily' | 'cumulative'
    selectedDevIds: [], // IDs selecionados. Se vazio, todos são exibidos
    showBaseline: true // Exibe a linha de referência da Squad
  },
  isLoading: false
};

// Controle de Conexão com o Backend (SQLite / Arquivo / Local)
const backendState = {
  active: false,
  storageType: 'local', // 'sqlite' | 'file' | 'local'
  storagePath: ''
};

// Inicialização da Aplicação
document.addEventListener('DOMContentLoaded', async () => {
  loadStateFromStorage();
  setupEventListeners();
  refreshDashboard();
  updateStorageIndicator();

  // Tenta conectar ao backend FastAPI (SQLite/Arquivo)
  await initBackendStorage();
});

// Sonda o backend e inicializa a persistência remota
async function initBackendStorage() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const health = await res.json();
      backendState.active = true;
      backendState.storageType = health.storage_type || 'sqlite';
      backendState.storagePath = health.storage_path || '';

      // Busca dados sincronizados do servidor
      const dataRes = await fetch('/api/data');
      if (dataRes.ok) {
        const serverData = await dataRes.json();
        
        if (Array.isArray(serverData.projects) && serverData.projects.length > 0) {
          state.projects = serverData.projects.map(proj => ({
            ...proj,
            gitlabUrl: proj.gitlabUrl || '',
            gitlabToken: proj.gitlabToken || '',
            allBranches: proj.allBranches !== false
          }));
        }
        if (Array.isArray(serverData.developers) && serverData.developers.length > 0) {
          state.developers = serverData.developers.map(dev => ({
            ...dev,
            projectIds: Array.isArray(dev.projectIds) ? dev.projectIds : []
          }));
        }
        if (serverData.config) {
          state.gitlabConfig = serverData.config;
        }
        if (serverData.mode) {
          state.mode = serverData.mode;
        }
        if (serverData.selectedProjectId) {
          state.selectedProjectId = serverData.selectedProjectId;
        }

        // Salva cópia local para resiliência
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(state.projects));
        localStorage.setItem(STORAGE_KEYS.DEVS, JSON.stringify(state.developers));
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(state.gitlabConfig));
        localStorage.setItem(STORAGE_KEYS.MODE, state.mode);
        localStorage.setItem(STORAGE_KEYS.SELECTED_PROJECT, state.selectedProjectId);

        refreshDashboard();
      }
    }
  } catch (e) {
    // Backend offline ou modo puramente estático
    backendState.active = false;
    backendState.storageType = 'local';
  }

  updateStorageIndicator();
}

// Atualiza o indicador visual de armazenamento no rodapé
function updateStorageIndicator() {
  const indicator = document.getElementById('storage-status-indicator');
  const text = document.getElementById('storage-status-text');
  const dot = indicator ? indicator.querySelector('.storage-dot') : null;

  if (!indicator || !text) return;

  if (backendState.active) {
    if (backendState.storageType === 'sqlite') {
      if (dot) dot.className = 'storage-dot sqlite';
      text.textContent = 'Armazenamento: SQLite';
      indicator.title = `Persistência ativa em SQLite (${backendState.storagePath})`;
    } else if (backendState.storageType === 'file') {
      if (dot) dot.className = 'storage-dot file';
      text.textContent = 'Armazenamento: Arquivo JSON';
      indicator.title = `Persistência ativa em Arquivo JSON (${backendState.storagePath})`;
    }
  } else {
    if (dot) dot.className = 'storage-dot local';
    text.textContent = 'Armazenamento: Navegador';
    indicator.title = 'Persistência no localStorage do navegador (sem backend)';
  }
}

// Sincroniza dados com o backend com debounce
let syncDebounceTimer = null;
function syncStateToBackend() {
  if (!backendState.active) return;

  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developers: state.developers,
          projects: state.projects,
          config: state.gitlabConfig,
          mode: state.mode,
          selectedProjectId: state.selectedProjectId
        })
      });
    } catch (err) {
      console.warn('Erro ao sincronizar com o backend:', err);
    }
  }, 250);
}

// Carrega configurações, projetos e desenvolvedores do localStorage
function loadStateFromStorage() {
  const savedMode = localStorage.getItem(STORAGE_KEYS.MODE);
  if (savedMode) state.mode = savedMode;

  const savedSelectedProject = localStorage.getItem(STORAGE_KEYS.SELECTED_PROJECT);
  if (savedSelectedProject) state.selectedProjectId = savedSelectedProject;

  // Carrega ou inicializa projetos (com migração de credenciais)
  const savedProjects = localStorage.getItem(STORAGE_KEYS.PROJECTS);
  if (savedProjects) {
    try {
      const loadedProjects = JSON.parse(savedProjects);
      // Migração: garante gitlabUrl e gitlabToken em todos os projetos
      state.projects = loadedProjects.map(proj => ({
        ...proj,
        gitlabUrl: proj.gitlabUrl || '',
        gitlabToken: proj.gitlabToken || '',
        allBranches: proj.allBranches !== false
      }));
    } catch (e) {
      state.projects = [...DEFAULT_DEMO_PROJECTS];
    }
  } else {
    state.projects = [...DEFAULT_DEMO_PROJECTS];
    saveProjectsToStorage();
  }

  // Carrega desenvolvedores com migração de dados
  const savedDevs = localStorage.getItem(STORAGE_KEYS.DEVS);
  if (savedDevs) {
    try {
      const loadedDevs = JSON.parse(savedDevs);
      // Migração: garante propriedade projectIds em todos os devs
      state.developers = loadedDevs.map(dev => ({
        ...dev,
        projectIds: Array.isArray(dev.projectIds) ? dev.projectIds : []
      }));
    } catch (e) {
      state.developers = [...DEFAULT_DEMO_DEVS];
    }
  } else {
    state.developers = [...DEFAULT_DEMO_DEVS];
    saveDevelopersToStorage();
  }

  const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (savedConfig) {
    try {
      state.gitlabConfig = JSON.parse(savedConfig);
    } catch (e) {}
  }
}

function saveDevelopersToStorage() {
  localStorage.setItem(STORAGE_KEYS.DEVS, JSON.stringify(state.developers));
  syncStateToBackend();
}

function saveProjectsToStorage() {
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(state.projects));
  syncStateToBackend();
}

function saveSelectedProjectToStorage() {
  localStorage.setItem(STORAGE_KEYS.SELECTED_PROJECT, state.selectedProjectId);
  syncStateToBackend();
}

function saveConfigToStorage() {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(state.gitlabConfig));
  syncStateToBackend();
}

function saveModeToStorage() {
  localStorage.setItem(STORAGE_KEYS.MODE, state.mode);
  syncStateToBackend();
}


// Funções Utilitárias de Gerenciamento de Projetos
function getDevsForProject(projectId) {
  if (!projectId || projectId === 'all') return state.developers;
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return state.developers;

  return state.developers.filter(dev => 
    (project.devIds && project.devIds.includes(dev.id)) ||
    (dev.projectIds && dev.projectIds.includes(projectId))
  );
}

// Retorna credenciais do projeto ou fallback global
function getProjectCredentials(project) {
  const url = (project && project.gitlabUrl) ? project.gitlabUrl : (state.gitlabConfig.url || '');
  const token = (project && project.gitlabToken) ? project.gitlabToken : (state.gitlabConfig.token || '');
  return { url: url.replace(/\/$/, ''), token };
}

// Verifica se um projeto tem credenciais válidas (próprias ou fallback)
function projectHasCredentials(project) {
  const creds = getProjectCredentials(project);
  return !!(creds.url && creds.token);
}

// Event Listeners da UI
function setupEventListeners() {
  // Alteração de Modo (Demo / GitLab Real)
  const modeDemoBtn = document.getElementById('mode-demo-btn');
  const modeGitlabBtn = document.getElementById('mode-gitlab-btn');

  modeDemoBtn.addEventListener('click', () => setMode('demo'));
  modeGitlabBtn.addEventListener('click', () => setMode('gitlab'));

  // Modais
  document.getElementById('config-btn').addEventListener('click', () => openModal('modal-gitlab-config'));
  document.getElementById('banner-config-btn').addEventListener('click', () => openModal('modal-gitlab-config'));
  document.getElementById('manage-devs-btn').addEventListener('click', () => {
    resetDevForm();
    renderManageDevsList();
    openModal('modal-manage-devs');
  });

  const manageProjectsBtn = document.getElementById('manage-projects-btn');
  if (manageProjectsBtn) {
    manageProjectsBtn.addEventListener('click', () => {
      resetProjectForm();
      renderManageProjectsList();
      openModal('modal-manage-projects');
    });
  }

  document.querySelectorAll('.modal-close, [data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.target.getAttribute('data-close') || e.target.closest('.modal-overlay').id;
      closeModal(modalId);
    });
  });

  // Filtros & Pesquisa
  const projectSelect = document.getElementById('project-select');
  if (projectSelect) {
    projectSelect.addEventListener('change', (e) => {
      state.selectedProjectId = e.target.value;
      saveSelectedProjectToStorage();
      refreshDashboard();
    });
  }

  document.getElementById('period-select').addEventListener('change', (e) => {
    state.periodDays = parseInt(e.target.value, 10);
    refreshDashboard();
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    state.statusFilter = e.target.value;
    renderDashboardComponents();
  });

  document.getElementById('search-dev-input').addEventListener('input', (e) => {
    state.searchTerm = e.target.value.toLowerCase().trim();
    renderDashboardComponents();
  });

  // Controles do Módulo de Produtividade & Desvios
  const metricPills = document.getElementById('productivity-metric-pills');
  if (metricPills) {
    metricPills.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const metric = e.target.getAttribute('data-metric');
        if (!metric) return;
        state.productivitySettings.metric = metric;
        metricPills.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderDashboardComponents();
      });
    });
  }

  const viewPills = document.getElementById('productivity-view-pills');
  if (viewPills) {
    viewPills.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.getAttribute('data-view');
        if (!view) return;
        state.productivitySettings.viewMode = view;
        viewPills.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderDashboardComponents();
      });
    });
  }

  const selectAllDevsBtn = document.getElementById('select-all-chart-devs-btn');
  if (selectAllDevsBtn) {
    selectAllDevsBtn.addEventListener('click', () => {
      const activeDevs = getDevsForProject(state.selectedProjectId);
      state.productivitySettings.selectedDevIds = activeDevs.map(d => d.id);
      renderDashboardComponents();
    });
  }

  const clearAllDevsBtn = document.getElementById('clear-all-chart-devs-btn');
  if (clearAllDevsBtn) {
    clearAllDevsBtn.addEventListener('click', () => {
      state.productivitySettings.selectedDevIds = [];
      renderDashboardComponents();
    });
  }

  // Formulário Adicionar / Editar Dev
  document.getElementById('add-dev-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-dev-id').value;
    const name = document.getElementById('dev-name-input').value.trim();
    const email = document.getElementById('dev-email-input').value.trim();
    const username = document.getElementById('dev-username-input').value.trim();
    const team = document.getElementById('dev-team-input').value.trim() || 'Geral';

    if (!name || !email) return;

    if (editId) {
      const dev = state.developers.find(d => d.id === editId);
      if (dev) {
        dev.name = name;
        dev.email = email;
        dev.username = username || email.split('@')[0];
        dev.team = team;
      }
    } else {
      const newDev = {
        id: 'dev-' + Date.now(),
        name,
        email,
        username: username || email.split('@')[0],
        team,
        projectIds: []
      };
      state.developers.push(newDev);
    }

    saveDevelopersToStorage();
    resetDevForm();
    renderManageDevsList();
    renderManageProjectsList();
    refreshDashboard();
  });

  const cancelDevEditBtn = document.getElementById('cancel-dev-edit-btn');
  if (cancelDevEditBtn) {
    cancelDevEditBtn.addEventListener('click', () => {
      resetDevForm();
    });
  }

  // Formulário GitLab Config
  document.getElementById('gitlab-config-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.gitlabConfig.url = document.getElementById('gitlab-url-input').value.trim().replace(/\/$/, '');
    state.gitlabConfig.token = document.getElementById('gitlab-token-input').value.trim();
    state.gitlabConfig.projectId = document.getElementById('gitlab-project-id-input').value.trim();

    saveConfigToStorage();
    closeModal('modal-gitlab-config');
    
    if (state.mode === 'gitlab') {
      refreshDashboard();
    } else {
      setMode('gitlab');
    }
  });

  // Testar Conexão GitLab
  document.getElementById('test-gitlab-connection-btn').addEventListener('click', testGitLabConnection);

  // Exportar CSV
  document.getElementById('export-csv-btn').addEventListener('click', exportAdherenceReportCSV);
}

function setMode(newMode) {
  state.mode = newMode;
  saveModeToStorage();

  document.getElementById('mode-demo-btn').classList.toggle('active', newMode === 'demo');
  document.getElementById('mode-gitlab-btn').classList.toggle('active', newMode === 'gitlab');

  const footerStatus = document.getElementById('footer-status-label');
  footerStatus.textContent = newMode === 'demo' ? 'Modo: Demonstração' : 'Modo: Conexão Real GitLab';

  refreshDashboard();
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    if (modalId === 'modal-gitlab-config') {
      document.getElementById('gitlab-url-input').value = state.gitlabConfig.url;
      document.getElementById('gitlab-token-input').value = state.gitlabConfig.token;
      document.getElementById('gitlab-project-id-input').value = state.gitlabConfig.projectId;
      document.getElementById('connection-status-msg').classList.add('hidden');
    }
    modal.classList.remove('hidden');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
  if (modalId === 'modal-manage-devs') {
    resetDevForm();
  } else if (modalId === 'modal-manage-projects') {
    resetProjectForm();
  }
}

// Atualiza os Dados e a Interface
async function refreshDashboard() {
  const warningBanner = document.getElementById('api-warning-banner');
  const loadingIndicator = document.getElementById('matrix-loading');
  const matrixTable = document.getElementById('devs-matrix-table');

  if (state.mode === 'gitlab' && (!state.gitlabConfig.url || !state.gitlabConfig.token)) {
    warningBanner.classList.remove('hidden');
  } else {
    warningBanner.classList.add('hidden');
  }

  loadingIndicator.classList.remove('hidden');
  matrixTable.style.opacity = '0.4';

  if (state.mode === 'demo') {
    const demoData = generateDemoCommitData(state.developers, state.periodDays);
    state.commitData = demoData.commitData;
    state.commitStats = demoData.commitStats;
  } else {
    const realData = await fetchGitLabRealCommitData(state.developers, state.periodDays);
    state.commitData = realData.commitData;
    state.commitStats = realData.commitStats;
  }

  loadingIndicator.classList.add('hidden');
  matrixTable.style.opacity = '1';

  renderDashboardComponents();
}

// Gerador de Dados Simulados Realistas para o Modo Demo
function generateDemoCommitData(devs, daysCount) {
  const commitData = {};
  const commitStats = {};
  const today = new Date();

  // Perfis de produtividade para os desenvolvedores simulados
  const devProfiles = [
    { baseAdd: 240, varAdd: 110, baseDel: 110, varDel: 50 },  // Ana: sênior, refatorações consistentes
    { baseAdd: 420, varAdd: 170, baseDel: 50,  varDel: 30 },  // Bruno: alto volume de código novo
    { baseAdd: 160, varAdd: 80,  baseDel: 40,  varDel: 25 },  // Carla: correções cirúrgicas e pontuais
    { baseAdd: 210, varAdd: 100, baseDel: 30,  varDel: 20 },  // Diego: cadência baixa, tarefas pontuais
    { baseAdd: 310, varAdd: 130, baseDel: 85,  varDel: 40 },  // Elena: equilibrada
    { baseAdd: 280, varAdd: 140, baseDel: 35,  varDel: 25 }   // Felipe: features novas, pouca refatoração
  ];

  devs.forEach((dev, index) => {
    commitData[dev.id] = {};
    commitStats[dev.id] = {};
    
    // Perfil de aderência diferente para cada dev simulado
    let adherenceRate = 0.90; // Padrão bom (ex: Ana)
    if (index === 1) adherenceRate = 0.95; // Bruno (excepcional)
    if (index === 2) adherenceRate = 0.75; // Carla (atenção)
    if (index === 3) adherenceRate = 0.40; // Diego (crítico, dias ausentes)
    if (index === 4) adherenceRate = 0.85; // Elena
    if (index === 5) adherenceRate = 0.60; // Felipe

    const profile = devProfiles[index % devProfiles.length];

    for (let i = 0; i < daysCount; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = formatDateKey(d);
      const dayOfWeek = d.getDay(); // 0 = Domingo, 6 = Sábado
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      let commitsCount = 0;
      if (isWeekend) {
        // Pouquíssimos commits no fim de semana (10% de chance)
        commitsCount = Math.random() < 0.10 ? Math.floor(Math.random() * 3) + 1 : 0;
      } else {
        // Dia útil: aplicar taxa de aderência simulada
        const committed = Math.random() < adherenceRate;
        commitsCount = committed ? Math.floor(Math.random() * 6) + 1 : 0;
      }

      commitData[dev.id][dateStr] = commitsCount;

      let additions = 0;
      let deletions = 0;
      if (commitsCount > 0) {
        for (let c = 0; c < commitsCount; c++) {
          const add = Math.max(15, Math.round(profile.baseAdd + (Math.random() * 2 - 1) * profile.varAdd));
          const del = Math.max(0, Math.round(profile.baseDel + (Math.random() * 2 - 1) * profile.varDel));
          additions += add;
          deletions += del;
        }
      }

      commitStats[dev.id][dateStr] = {
        count: commitsCount,
        additions,
        deletions,
        netLines: additions - deletions,
        outliers: 0
      };
    }
  });

  return { commitData, commitStats };
}

// Busca Real de Commits na API REST do GitLab (credenciais por projeto com fallback global)
async function fetchGitLabRealCommitData(devs, daysCount) {
  const commitData = {};
  const commitStats = {};
  devs.forEach(dev => {
    commitData[dev.id] = {};
    commitStats[dev.id] = {};
  });

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysCount);
  const sinceISO = sinceDate.toISOString();

  // Set para evitar contagem duplicada do mesmo commit
  const processedCommitHashes = new Set();

  // Determina quais projetos buscar
  let projectsToBuild = [];
  if (state.selectedProjectId && state.selectedProjectId !== 'all') {
    const proj = state.projects.find(p => p.id === state.selectedProjectId);
    if (proj) projectsToBuild = [proj];
  } else {
    projectsToBuild = [...state.projects];
  }

  // Filtra apenas projetos que tem gitlabProjectId e credenciais
  const projectsWithWarning = [];

  for (const proj of projectsToBuild) {
    if (!proj.gitlabProjectId) continue;

    const creds = getProjectCredentials(proj);
    if (!creds.url || !creds.token) {
      projectsWithWarning.push(proj.name);
      continue;
    }

    const useAllBranches = proj.allBranches !== false;
    let page = 1;
    const maxPages = 10; // Teto de segurança: até 1.000 commits por projeto
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      try {
        const queryParams = new URLSearchParams({
          since: sinceISO,
          per_page: '100',
          page: String(page),
          with_stats: 'true'
        });
        if (useAllBranches) {
          queryParams.set('all', 'true');
        }

        const commitsRes = await fetch(`${creds.url}/api/v4/projects/${encodeURIComponent(proj.gitlabProjectId)}/repository/commits?${queryParams.toString()}`, {
          headers: { 'PRIVATE-TOKEN': creds.token }
        });

        if (!commitsRes.ok) {
          console.warn(`GitLab API erro HTTP ${commitsRes.status} no projeto "${proj.name}", página ${page}`);
          break;
        }

        const commits = await commitsRes.json();
        if (!Array.isArray(commits) || commits.length === 0) {
          break;
        }

        let allCommitsOlderThanSince = true;

        commits.forEach(commit => {
          const commitDate = new Date(commit.created_at || commit.committed_date);
          if (commitDate >= sinceDate) {
            allCommitsOlderThanSince = false;
          }

          const commitKey = `${commit.id}-${commit.author_email || ''}`;
          if (processedCommitHashes.has(commitKey)) return;
          processedCommitHashes.add(commitKey);

          const dateStr = formatDateKey(commitDate);
          const authorEmail = (commit.author_email || '').toLowerCase();
          const authorName = (commit.author_name || '').toLowerCase();

          const matchedDev = devs.find(d => 
            (d.email && d.email.toLowerCase() === authorEmail) || 
            (d.name && d.name.toLowerCase() === authorName) ||
            (d.username && authorEmail.includes(d.username.toLowerCase()))
          );

          if (matchedDev) {
            if (!commitData[matchedDev.id]) commitData[matchedDev.id] = {};
            if (!commitData[matchedDev.id][dateStr]) commitData[matchedDev.id][dateStr] = 0;
            commitData[matchedDev.id][dateStr]++;

            if (!commitStats[matchedDev.id]) commitStats[matchedDev.id] = {};
            if (!commitStats[matchedDev.id][dateStr]) {
              commitStats[matchedDev.id][dateStr] = {
                count: 0,
                additions: 0,
                deletions: 0,
                netLines: 0,
                outliers: 0
              };
            }

            const rawStats = commit.stats || { additions: 0, deletions: 0, total: 0 };
            const totalLines = (rawStats.total != null) ? rawStats.total : ((rawStats.additions || 0) + (rawStats.deletions || 0));
            // Saneamento de ruído: commits anômalos com mais de 5.000 linhas alteradas
            // (ex.: lockfiles, migrações automáticas, swagger gerado)
            const isOutlier = totalLines > 5000;
            const safeAdd = isOutlier ? 0 : (rawStats.additions || 0);
            const safeDel = isOutlier ? 0 : (rawStats.deletions || 0);

            commitStats[matchedDev.id][dateStr].count++;
            commitStats[matchedDev.id][dateStr].additions += safeAdd;
            commitStats[matchedDev.id][dateStr].deletions += safeDel;
            commitStats[matchedDev.id][dateStr].netLines += (safeAdd - safeDel);
            if (isOutlier) commitStats[matchedDev.id][dateStr].outliers++;
          }
        });

        // Se todos os commits desta página já forem anteriores ao período solicitado, encerra paginação
        if (allCommitsOlderThanSince) {
          break;
        }

        const nextPage = commitsRes.headers.get('x-next-page');
        if (nextPage && parseInt(nextPage, 10) > page) {
          page = parseInt(nextPage, 10);
        } else if (commits.length === 100) {
          page++;
        } else {
          hasMore = false;
        }
      } catch (e) {
        console.warn(`Erro ao buscar commits do projeto "${proj.name}" na página ${page}:`, e);
        break;
      }
    }
  }

  // Exibe aviso para projetos sem credenciais
  const warningBanner = document.getElementById('api-warning-banner');
  const alertContent = warningBanner ? warningBanner.querySelector('.alert-content') : null;
  if (projectsWithWarning.length > 0 && alertContent) {
    alertContent.innerHTML = `<strong>Projetos sem credenciais GitLab:</strong> ${projectsWithWarning.join(', ')}. Configure o token em "Gerenciar Projetos" ou nas "Configurações API" (fallback global).`;
    warningBanner.classList.remove('hidden');
  }

  return { commitData, commitStats };
}

// Testa a Conexão com o GitLab
async function testGitLabConnection() {
  const url = document.getElementById('gitlab-url-input').value.trim().replace(/\/$/, '');
  const token = document.getElementById('gitlab-token-input').value.trim();
  const statusMsg = document.getElementById('connection-status-msg');

  if (!url || !token) {
    statusMsg.className = 'connection-status error';
    statusMsg.textContent = 'Por favor, informe a URL e o Personal Access Token.';
    statusMsg.classList.remove('hidden');
    return;
  }

  statusMsg.className = 'connection-status';
  statusMsg.textContent = 'Testando conexão com o GitLab...';
  statusMsg.classList.remove('hidden');

  try {
    const res = await fetch(`${url}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token }
    });

    if (res.ok) {
      const user = await res.json();
      statusMsg.className = 'connection-status success';
      statusMsg.textContent = `Conexão efetuada com sucesso! Conectado como: ${user.name} (@${user.username})`;
    } else {
      statusMsg.className = 'connection-status error';
      statusMsg.textContent = `Falha na autenticação (HTTP ${res.status}). Verifique o token fornecido.`;
    }
  } catch (err) {
    statusMsg.className = 'connection-status error';
    statusMsg.textContent = `Erro de conexão: ${err.message}. Verifique a URL do servidor.`;
  }
}

// Cálculo da Lista de Dias no Período Selecionado
function getPeriodDaysList(count) {
  const days = [];
  const today = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayOfWeek = d.getDay();
    days.push({
      date: d,
      dateStr: formatDateKey(d),
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      weekdayLabel: d.toLocaleDateString('pt-BR', { weekday: 'narrow' })
    });
  }
  return days;
}

// Renderiza as Opções do Seletor de Projetos
function renderProjectSelectOptions() {
  const selectEl = document.getElementById('project-select');
  if (!selectEl) return;

  const optionsHtml = `
    <option value="all" ${state.selectedProjectId === 'all' ? 'selected' : ''}>Todos os Projetos (${state.developers.length} devs)</option>
    ${state.projects.map(p => {
      const devsCount = getDevsForProject(p.id).length;
      return `<option value="${p.id}" ${state.selectedProjectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)} (${devsCount} devs)</option>`;
    }).join('')}
  `;

  selectEl.innerHTML = optionsHtml;
}

// Renderização dos Componentes
function renderDashboardComponents() {
  renderProjectSelectOptions();

  // Atualiza badge de escopo de branches monitoradas
  const scopeBadge = document.getElementById('scope-branches-badge');
  if (scopeBadge) {
    if (state.selectedProjectId && state.selectedProjectId !== 'all') {
      const selectedProj = state.projects.find(p => p.id === state.selectedProjectId);
      if (selectedProj && selectedProj.allBranches === false) {
        scopeBadge.className = 'badge badge-subtle';
        scopeBadge.textContent = 'Branch Padrão';
        scopeBadge.title = 'Monitorando commits apenas na branch padrão configurada no GitLab';
      } else {
        scopeBadge.className = 'badge badge-success';
        scopeBadge.textContent = '🌿 Todas as Branches';
        scopeBadge.title = 'Rastreando commits em todas as branches ativas deste projeto para evitar falsos negativos';
      }
    } else {
      scopeBadge.className = 'badge badge-success';
      scopeBadge.textContent = '🌿 Todas as Branches';
      scopeBadge.title = 'Rastreando commits em todas as branches ativas dos projetos para evitar falsos negativos';
    }
  }

  const periodDaysList = getPeriodDaysList(state.periodDays);
  const activeDevs = getDevsForProject(state.selectedProjectId);

  // Calcula estatísticas individuais por dev
  const devStatsList = activeDevs.map(dev => {
    let workingDaysTotal = 0;
    let workingDaysWithCommits = 0;
    let totalCommits = 0;
    let currentStreak = 0;
    let isStreakActive = true;
    let missingWorkdaysStreak = 0;
    let todayCommitted = false;

    const todayStr = formatDateKey(new Date());

    periodDaysList.forEach(day => {
      const commitsOnDay = (state.commitData[dev.id] && state.commitData[dev.id][day.dateStr]) || 0;
      totalCommits += commitsOnDay;

      if (day.dateStr === todayStr && commitsOnDay > 0) {
        todayCommitted = true;
      }

      if (!day.isWeekend) {
        workingDaysTotal++;
        if (commitsOnDay > 0) {
          workingDaysWithCommits++;
        }
      }
    });

    // Calcula streak de dias úteis com commit (do mais recente para trás)
    for (let i = periodDaysList.length - 1; i >= 0; i--) {
      const day = periodDaysList[i];
      if (day.isWeekend) continue; // Ignora fins de semana no cálculo de streak

      const commits = (state.commitData[dev.id] && state.commitData[dev.id][day.dateStr]) || 0;
      
      if (commits > 0 && isStreakActive) {
        currentStreak++;
      } else {
        isStreakActive = false;
      }

      if (commits === 0) {
        missingWorkdaysStreak++;
      } else {
        break; // Interrompe contagem de ausência no primeiro commit encontrado
      }
    }

    const adherenceRate = workingDaysTotal > 0 ? Math.round((workingDaysWithCommits / workingDaysTotal) * 100) : 0;
    
    let statusCategory = 'compliant';
    if (adherenceRate < 50) statusCategory = 'critical';
    else if (adherenceRate < 80) statusCategory = 'warning';

    return {
      dev,
      workingDaysTotal,
      workingDaysWithCommits,
      totalCommits,
      currentStreak,
      missingWorkdaysStreak,
      todayCommitted,
      adherenceRate,
      statusCategory
    };
  });

  // Filtra desenvolvedores por busca e status
  const filteredDevStats = devStatsList.filter(item => {
    const matchesSearch = item.dev.name.toLowerCase().includes(state.searchTerm) || 
                          item.dev.email.toLowerCase().includes(state.searchTerm) ||
                          item.dev.team.toLowerCase().includes(state.searchTerm);

    const matchesStatus = state.statusFilter === 'all' || item.statusCategory === state.statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Renderiza Seções
  renderMetricsSummary(devStatsList);
  renderProductivityAnalytics(activeDevs, periodDaysList);
  renderMatrixTable(periodDaysList, filteredDevStats);
  renderDevCardsGrid(filteredDevStats);
}

// Renderiza Métricas Globais do Topo
function renderMetricsSummary(devStatsList) {
  const totalDevs = devStatsList.length;
  
  let totalAdherenceSum = 0;
  let commitsTodayTotal = 0;
  let devsCommittedTodayCount = 0;
  let atRiskDevsCount = 0;

  devStatsList.forEach(item => {
    totalAdherenceSum += item.adherenceRate;
    if (item.todayCommitted) {
      devsCommittedTodayCount++;
    }
    // Considera em risco quem tem aderência baixa ou está sem commit há 2+ dias úteis
    if (item.adherenceRate < 70 || item.missingWorkdaysStreak >= 2) {
      atRiskDevsCount++;
    }
  });

  const teamAdherence = totalDevs > 0 ? Math.round(totalAdherenceSum / totalDevs) : 0;

  document.getElementById('metric-team-adherence').textContent = `${teamAdherence}%`;
  document.getElementById('team-progress-bar').style.width = `${teamAdherence}%`;
  document.getElementById('metric-total-devs').textContent = totalDevs;
  
  // Commits hoje (soma de commits do dia atual)
  const todayStr = formatDateKey(new Date());
  let commitsTodaySum = 0;
  devStatsList.forEach(item => {
    commitsTodaySum += (state.commitData[item.dev.id] && state.commitData[item.dev.id][todayStr]) || 0;
  });

  document.getElementById('metric-commits-today').textContent = commitsTodaySum;
  document.getElementById('metric-devs-committed-today').textContent = `${devsCommittedTodayCount} de ${totalDevs} devs comitaram hoje`;
  document.getElementById('metric-at-risk-devs').textContent = atRiskDevsCount;
}

// ============================================================================
// MÓDULO DE PRODUTIVIDADE & DESVIOS RELATIVOS (TICKETS 02, 03, 04)
// ============================================================================

// Paleta de cores vibrantes e distintas para as curvas dos desenvolvedores
const DEV_CHART_PALETTE = [
  { stroke: '#38bdf8', fill: 'rgba(56, 189, 248, 0.12)', name: 'Azul Celeste' },
  { stroke: '#34d399', fill: 'rgba(52, 211, 153, 0.12)', name: 'Esmeralda' },
  { stroke: '#fbbf24', fill: 'rgba(251, 191, 36, 0.12)', name: 'Âmbar' },
  { stroke: '#f472b6', fill: 'rgba(244, 114, 182, 0.12)', name: 'Rosa' },
  { stroke: '#a78bfa', fill: 'rgba(167, 139, 250, 0.12)', name: 'Púrpura' },
  { stroke: '#22d3ee', fill: 'rgba(34, 211, 238, 0.12)', name: 'Ciano' },
  { stroke: '#fb923c', fill: 'rgba(251, 146, 60, 0.12)', name: 'Laranja' },
  { stroke: '#2dd4bf', fill: 'rgba(45, 212, 191, 0.12)', name: 'Turquesa' }
];

function getDevColor(index) {
  return DEV_CHART_PALETTE[index % DEV_CHART_PALETTE.length];
}

// Extrai o valor da métrica para um dev em uma data específica
function getDevDailyMetricValue(devId, dateStr, metricType) {
  const stats = state.commitStats?.[devId]?.[dateStr];
  if (!stats) return 0;
  if (metricType === 'commits') return stats.count || 0;
  if (metricType === 'additions') return stats.additions || 0;
  if (metricType === 'deletions') return stats.deletions || 0;
  // Padrão: netLines (linhas líquidas = adições - deleções, com piso zero)
  return Math.max(0, stats.netLines != null ? stats.netLines : (stats.additions - stats.deletions));
}

// Gera a série de valores de um desenvolvedor (diária ou acumulada)
function getDevTimeSeries(devId, metricType, isCumulative, timeline) {
  const series = [];
  let runningSum = 0;
  timeline.forEach(day => {
    const val = getDevDailyMetricValue(devId, day.dateStr, metricType);
    if (isCumulative) {
      runningSum += val;
      series.push(runningSum);
    } else {
      series.push(val);
    }
  });
  return series;
}

// Gera a série da Média da Squad (Baseline de comparação)
function getSquadBaselineSeries(activeDevs, metricType, isCumulative, timeline) {
  if (!activeDevs || activeDevs.length === 0) {
    return timeline.map(() => 0);
  }

  const allSeries = activeDevs.map(dev => getDevTimeSeries(dev.id, metricType, isCumulative, timeline));

  return timeline.map((_, dayIdx) => {
    let sum = 0;
    allSeries.forEach(s => {
      sum += (s[dayIdx] || 0);
    });
    return Math.round(sum / activeDevs.length);
  });
}

// Calcula estatísticas consolidadas e índices de desvio percentual
function calculateProductivityAggregates(activeDevs, metricType, timeline) {
  if (!activeDevs || activeDevs.length === 0) {
    return {
      devAggregates: [],
      squadAverageTotal: 0,
      topProducer: null,
      topRefactorer: null,
      balancedDevsCount: 0
    };
  }

  const devAggregates = activeDevs.map((dev, idx) => {
    let totalCommits = 0;
    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalNetLines = 0;

    timeline.forEach(day => {
      const stats = state.commitStats?.[dev.id]?.[day.dateStr] || { count: 0, additions: 0, deletions: 0, netLines: 0 };
      totalCommits += stats.count || 0;
      totalAdditions += stats.additions || 0;
      totalDeletions += stats.deletions || 0;
      totalNetLines += Math.max(0, stats.netLines != null ? stats.netLines : (stats.additions - stats.deletions));
    });

    let currentMetricTotal = totalNetLines;
    if (metricType === 'commits') currentMetricTotal = totalCommits;
    if (metricType === 'additions') currentMetricTotal = totalAdditions;

    return {
      dev,
      color: getDevColor(idx),
      totalCommits,
      totalAdditions,
      totalDeletions,
      totalNetLines,
      currentMetricTotal,
      deviationPercent: 0
    };
  });

  const totalSum = devAggregates.reduce((acc, item) => acc + item.currentMetricTotal, 0);
  const squadAverageTotal = Math.round(totalSum / devAggregates.length);

  let balancedDevsCount = 0;
  devAggregates.forEach(item => {
    if (squadAverageTotal > 0) {
      item.deviationPercent = Math.round(((item.currentMetricTotal - squadAverageTotal) / squadAverageTotal) * 100);
    } else {
      item.deviationPercent = 0;
    }
    if (Math.abs(item.deviationPercent) <= 20) {
      balancedDevsCount++;
    }
  });

  const topProducer = [...devAggregates].sort((a, b) => b.totalAdditions - a.totalAdditions)[0] || null;
  const topRefactorer = [...devAggregates].sort((a, b) => b.totalDeletions - a.totalDeletions)[0] || null;

  return {
    devAggregates,
    squadAverageTotal,
    topProducer,
    topRefactorer,
    balancedDevsCount
  };
}

// Renderizador Principal da Seção de Produtividade
function renderProductivityAnalytics(activeDevs, periodDaysList) {
  const section = document.getElementById('productivity-analytics-section');
  if (!section) return;

  if (!activeDevs || activeDevs.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'flex';

  const metricType = state.productivitySettings.metric || 'netLines';
  const isCumulative = state.productivitySettings.viewMode === 'cumulative';

  // Sincroniza seleção de devs se vazia ou inválida
  if (!state.productivitySettings.selectedDevIds || state.productivitySettings.selectedDevIds.length === 0) {
    state.productivitySettings.selectedDevIds = activeDevs.map(d => d.id);
  } else {
    const activeIds = new Set(activeDevs.map(d => d.id));
    state.productivitySettings.selectedDevIds = state.productivitySettings.selectedDevIds.filter(id => activeIds.has(id));
    if (state.productivitySettings.selectedDevIds.length === 0) {
      state.productivitySettings.selectedDevIds = activeDevs.map(d => d.id);
    }
  }

  const aggregates = calculateProductivityAggregates(activeDevs, metricType, periodDaysList);
  const baselineSeries = getSquadBaselineSeries(activeDevs, metricType, isCumulative, periodDaysList);

  renderProductivitySummaryCards(aggregates, metricType, isCumulative, periodDaysList.length);
  renderProductivityDevPills(activeDevs, aggregates);
  renderProductivitySvgChart(periodDaysList, activeDevs, aggregates, baselineSeries, metricType, isCumulative);
}

// Renderiza os Cards de Resumo de Produtividade e Desvios
function renderProductivitySummaryCards(aggregates, metricType, isCumulative, daysCount) {
  const container = document.getElementById('productivity-summary-grid');
  if (!container) return;

  let metricUnit = 'linhas';
  let metricLabel = 'Linhas Líquidas';
  if (metricType === 'commits') {
    metricUnit = 'commits';
    metricLabel = 'Commits';
  } else if (metricType === 'additions') {
    metricUnit = 'linhas';
    metricLabel = 'Linhas Adicionadas';
  }

  const avgVal = aggregates.squadAverageTotal;
  const avgDaily = Math.round(avgVal / Math.max(1, daysCount));

  const topProd = aggregates.topProducer;
  const topRefact = aggregates.topRefactorer;

  container.innerHTML = `
    <div class="prod-card">
      <div class="prod-card-header">
        <span class="prod-card-title">Média da Squad (${metricLabel})</span>
        <span class="prod-card-icon">📊</span>
      </div>
      <div class="prod-card-value">${avgVal.toLocaleString('pt-BR')} <span style="font-size:0.85rem; font-weight:500; color:var(--text-muted);">${metricUnit}</span></div>
      <div class="prod-card-subtext">~${avgDaily.toLocaleString('pt-BR')} ${metricUnit}/dia por dev</div>
      <span class="prod-card-badge neutral">🎯 Baseline de Referência</span>
    </div>

    <div class="prod-card">
      <div class="prod-card-header">
        <span class="prod-card-title">Maior Volume de Código</span>
        <span class="prod-card-icon">⚡</span>
      </div>
      <div class="prod-card-value">${topProd ? escapeHtml(topProd.dev.name.split(' ')[0]) : '-'}</div>
      <div class="prod-card-subtext">${topProd ? `+${topProd.totalAdditions.toLocaleString('pt-BR')} linhas adicionadas` : 'Sem dados'}</div>
      <span class="prod-card-badge ${topProd && topProd.deviationPercent >= 0 ? 'positive' : 'negative'}">
        ${topProd ? `${topProd.deviationPercent >= 0 ? '+' : ''}${topProd.deviationPercent}% vs média` : '0%'}
      </span>
    </div>

    <div class="prod-card">
      <div class="prod-card-header">
        <span class="prod-card-title">Maior Refatoração / Limpeza</span>
        <span class="prod-card-icon">🧹</span>
      </div>
      <div class="prod-card-value">${topRefact ? escapeHtml(topRefact.dev.name.split(' ')[0]) : '-'}</div>
      <div class="prod-card-subtext">${topRefact ? `-${topRefact.totalDeletions.toLocaleString('pt-BR')} linhas excluídas` : 'Sem dados'}</div>
      <span class="prod-card-badge positive">✨ Saneamento & Qualidade</span>
    </div>

    <div class="prod-card">
      <div class="prod-card-header">
        <span class="prod-card-title">Dispersão da Equipe</span>
        <span class="prod-card-icon">⚖️</span>
      </div>
      <div class="prod-card-value">${aggregates.balancedDevsCount} <span style="font-size:0.85rem; font-weight:500; color:var(--text-muted);">de ${aggregates.devAggregates.length} devs</span></div>
      <div class="prod-card-subtext">Alinhados com a média da squad</div>
      <span class="prod-card-badge neutral">Faixa +/- 20% equilibrada</span>
    </div>
  `;
}

// Renderiza as Pílulas de Seleção de Devs no Gráfico
function renderProductivityDevPills(activeDevs, aggregates) {
  const container = document.getElementById('productivity-dev-pills');
  if (!container) return;

  const selectedSet = new Set(state.productivitySettings.selectedDevIds || []);
  const showBaseline = state.productivitySettings.showBaseline !== false;

  let html = `
    <div class="dev-chart-pill baseline-pill ${showBaseline ? 'active' : ''}" id="toggle-baseline-pill" title="Clique para exibir/ocultar a linha média da squad">
      <span class="pill-color-indicator"></span>
      <span class="pill-dev-name">Média da Squad (Baseline)</span>
    </div>
  `;

  aggregates.devAggregates.forEach(item => {
    const isSelected = selectedSet.has(item.dev.id);
    const devColor = item.color.stroke;
    
    let devClass = 'even';
    let devPrefix = '';
    if (item.deviationPercent > 5) {
      devClass = 'above';
      devPrefix = '+';
    } else if (item.deviationPercent < -5) {
      devClass = 'below';
    }

    html += `
      <div class="dev-chart-pill ${isSelected ? 'active' : ''}" data-dev-pill="${item.dev.id}" style="--pill-color: ${devColor};" title="Clique para alternar no gráfico">
        <span class="pill-color-indicator"></span>
        <span class="pill-dev-name">${escapeHtml(item.dev.name)}</span>
        <span class="pill-dev-deviation ${devClass}">${devPrefix}${item.deviationPercent}%</span>
      </div>
    `;
  });

  container.innerHTML = html;

  // Listeners das pílulas
  const baselinePill = document.getElementById('toggle-baseline-pill');
  if (baselinePill) {
    baselinePill.addEventListener('click', () => {
      state.productivitySettings.showBaseline = !showBaseline;
      renderDashboardComponents();
    });
  }

  container.querySelectorAll('[data-dev-pill]').forEach(pill => {
    pill.addEventListener('click', (e) => {
      const devId = pill.getAttribute('data-dev-pill');
      if (!devId) return;

      const current = new Set(state.productivitySettings.selectedDevIds || []);
      if (current.has(devId)) {
        current.delete(devId);
      } else {
        current.add(devId);
      }
      state.productivitySettings.selectedDevIds = Array.from(current);
      renderDashboardComponents();
    });
  });
}

// Renderiza o Gráfico de Linhas Interativo em SVG Nativo
function renderProductivitySvgChart(timeline, activeDevs, aggregates, baselineSeries, metricType, isCumulative) {
  const container = document.getElementById('productivity-chart-container');
  const tooltip = document.getElementById('productivity-chart-tooltip');
  if (!container) return;

  const selectedSet = new Set(state.productivitySettings.selectedDevIds || []);
  const showBaseline = state.productivitySettings.showBaseline !== false;

  // Filtra devs selecionados
  const selectedDevsAgg = aggregates.devAggregates.filter(item => selectedSet.has(item.dev.id));

  // Coleta séries dos devs selecionados
  const devSeriesList = selectedDevsAgg.map(item => ({
    dev: item.dev,
    color: item.color,
    series: getDevTimeSeries(item.dev.id, metricType, isCumulative, timeline)
  }));

  // Coleta todos os valores para escala Y
  let allVals = [];
  if (showBaseline) {
    allVals.push(...baselineSeries);
  }
  devSeriesList.forEach(ds => {
    allVals.push(...ds.series);
  });

  let rawMax = Math.max(...allVals, 10);
  // Calcula um teto amigável (round nice)
  function getNiceMax(val) {
    if (val <= 10) return 10;
    if (val <= 25) return 25;
    if (val <= 50) return 50;
    if (val <= 100) return 100;
    const exp = Math.floor(Math.log10(val));
    const factor = Math.pow(10, exp);
    const normalized = val / factor;
    let nice;
    if (normalized <= 1.2) nice = 1.2;
    else if (normalized <= 2) nice = 2;
    else if (normalized <= 2.5) nice = 2.5;
    else if (normalized <= 5) nice = 5;
    else nice = 10;
    return Math.ceil(nice * factor);
  }

  const maxY = getNiceMax(rawMax * 1.08);
  const minY = 0;

  // Dimensões SVG
  const svgW = 1000;
  const svgH = 340;
  const padL = 65;
  const padR = 25;
  const padT = 25;
  const padB = 45;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const numDays = timeline.length;
  function getX(i) {
    if (numDays <= 1) return padL + plotW / 2;
    return padL + (i / (numDays - 1)) * plotW;
  }
  function getY(v) {
    return padT + plotH - ((v - minY) / (maxY - minY)) * plotH;
  }

  // Linhas de Grade e Eixo Y (5 níveis)
  const gridLevels = 4;
  let gridHtml = '';
  for (let l = 0; l <= gridLevels; l++) {
    const val = Math.round(minY + (l / gridLevels) * (maxY - minY));
    const yPos = getY(val);
    gridHtml += `
      <line x1="${padL}" y1="${yPos}" x2="${svgW - padR}" y2="${yPos}" stroke="rgba(255, 255, 255, 0.07)" stroke-dasharray="${l === 0 ? 'none' : '4,4'}" />
      <text x="${padL - 10}" y="${yPos + 4}" text-anchor="end" fill="var(--text-dim)" font-size="11" font-family="var(--font-mono)">${val >= 1000 ? (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k' : val}</text>
    `;
  }

  // Rótulos do Eixo X (datas com intervalo balanceado)
  let xAxisHtml = '';
  const xStep = Math.max(1, Math.ceil(numDays / 8));
  for (let i = 0; i < numDays; i += xStep) {
    const day = timeline[i];
    const xPos = getX(i);
    xAxisHtml += `
      <line x1="${xPos}" y1="${padT + plotH}" x2="${xPos}" y2="${padT + plotH + 5}" stroke="rgba(255, 255, 255, 0.2)" />
      <text x="${xPos}" y="${padT + plotH + 20}" text-anchor="middle" fill="var(--text-muted)" font-size="11" font-family="var(--font-mono)">${day.label}</text>
    `;
  }
  // Garante que o último dia (hoje) seja sempre exibido se não coincidir
  if ((numDays - 1) % xStep !== 0) {
    const lastIdx = numDays - 1;
    const lastDay = timeline[lastIdx];
    const xPos = getX(lastIdx);
    xAxisHtml += `
      <line x1="${xPos}" y1="${padT + plotH}" x2="${xPos}" y2="${padT + plotH + 5}" stroke="rgba(255, 255, 255, 0.2)" />
      <text x="${xPos}" y="${padT + plotH + 20}" text-anchor="middle" fill="var(--text-main)" font-weight="600" font-size="11" font-family="var(--font-mono)">${lastDay.label}</text>
    `;
  }

  // Gradientes e Definições
  let defsHtml = `
    <defs>
      <linearGradient id="baseline-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
      </linearGradient>
  `;
  devSeriesList.forEach(ds => {
    defsHtml += `
      <linearGradient id="grad-${ds.dev.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${ds.color.stroke}" stop-opacity="0.18" />
        <stop offset="100%" stop-color="${ds.color.stroke}" stop-opacity="0.0" />
      </linearGradient>
    `;
  });
  defsHtml += `</defs>`;

  // Linhas das Séries dos Desenvolvedores
  let seriesHtml = '';
  devSeriesList.forEach(ds => {
    const pts = ds.series.map((val, i) => ({ x: getX(i), y: getY(val), val }));
    const pathD = pts.map((p, idx) => (idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join(' ');
    const areaD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

    // Área sob a curva
    seriesHtml += `<path d="${areaD}" fill="url(#grad-${ds.dev.id})" />`;
    // Linha
    seriesHtml += `<path d="${pathD}" fill="none" stroke="${ds.color.stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    // Pontos
    pts.forEach(p => {
      seriesHtml += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${ds.color.stroke}" stroke="#0b0f19" stroke-width="1.5" />`;
    });
  });

  // Linha da Média da Squad (Destaque tracejado branco/ouro)
  let baselineHtml = '';
  if (showBaseline) {
    const basePts = baselineSeries.map((val, i) => ({ x: getX(i), y: getY(val), val }));
    const basePathD = basePts.map((p, idx) => (idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join(' ');
    
    baselineHtml += `
      <path d="${basePathD}" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />
    `;
    basePts.forEach(p => {
      baselineHtml += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#ffffff" stroke="#0b0f19" stroke-width="1.5" />`;
    });
  }

  // Crosshair Guide Line (inicialmente oculta)
  const crosshairHtml = `
    <line id="chart-crosshair" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="rgba(255, 255, 255, 0.35)" stroke-width="1.5" stroke-dasharray="3,3" opacity="0" pointer-events="none" />
  `;

  // Overlay invisível para captura de mouse
  const overlayHtml = `
    <rect id="chart-overlay-rect" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor: crosshair;" />
  `;

  container.innerHTML = `
    <svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none" id="productivity-svg">
      ${defsHtml}
      ${gridHtml}
      ${xAxisHtml}
      ${seriesHtml}
      ${baselineHtml}
      ${crosshairHtml}
      ${overlayHtml}
    </svg>
  `;

  // Interatividade de Hover e Tooltip
  const overlay = document.getElementById('chart-overlay-rect');
  const crosshair = document.getElementById('chart-crosshair');
  const svgEl = document.getElementById('productivity-svg');

  if (overlay && tooltip && svgEl) {
    overlay.addEventListener('mousemove', (e) => {
      const rect = overlay.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, clientX / rect.width));
      const dayIdx = Math.max(0, Math.min(numDays - 1, Math.round(progress * (numDays - 1))));
      
      const day = timeline[dayIdx];
      const targetX = getX(dayIdx);

      // Posiciona crosshair
      crosshair.setAttribute('x1', targetX);
      crosshair.setAttribute('x2', targetX);
      crosshair.setAttribute('opacity', '1');

      // Monta conteúdo do Tooltip
      let metricLabel = 'linhas';
      if (metricType === 'commits') metricLabel = 'commits';

      let itemsHtml = '';
      if (showBaseline) {
        const baseVal = baselineSeries[dayIdx] || 0;
        itemsHtml += `
          <div class="tooltip-item">
            <div class="tooltip-item-name">
              <span class="tooltip-dot" style="background:#fff;"></span>
              <strong>Média Squad:</strong>
            </div>
            <span class="tooltip-item-val">${baseVal.toLocaleString('pt-BR')} ${metricLabel}</span>
          </div>
        `;
      }

      devSeriesList.forEach(ds => {
        const val = ds.series[dayIdx] || 0;
        const baseVal = baselineSeries[dayIdx] || 0;
        let diffBadge = '';
        if (baseVal > 0) {
          const diff = Math.round(((val - baseVal) / baseVal) * 100);
          const diffSign = diff >= 0 ? '+' : '';
          const diffColor = diff >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
          diffBadge = `<span style="font-size:0.7rem; color:${diffColor}; margin-left:4px;">(${diffSign}${diff}%)</span>`;
        }

        itemsHtml += `
          <div class="tooltip-item">
            <div class="tooltip-item-name">
              <span class="tooltip-dot" style="background:${ds.color.stroke};"></span>
              <span>${escapeHtml(ds.dev.name)}:</span>
            </div>
            <span class="tooltip-item-val">${val.toLocaleString('pt-BR')} ${diffBadge}</span>
          </div>
        `;
      });

      tooltip.innerHTML = `
        <div class="tooltip-date">
          <span>📅 ${day.label} (${isCumulative ? 'Acumulado até hoje' : 'Produção do dia'})</span>
        </div>
        ${itemsHtml}
      `;

      // Posiciona Tooltip próximo ao cursor dentro do wrapper
      const wrapperRect = container.parentElement.getBoundingClientRect();
      const posX = e.clientX - wrapperRect.left;
      const posY = e.clientY - wrapperRect.top;

      tooltip.style.left = `${posX}px`;
      tooltip.style.top = `${Math.max(10, posY - 20)}px`;
      tooltip.classList.remove('hidden');
    });

    overlay.addEventListener('mouseleave', () => {
      crosshair.setAttribute('opacity', '0');
      tooltip.classList.add('hidden');
    });
  }
}

// Renderiza a Tabela Matriz Diária
function renderMatrixTable(periodDaysList, filteredDevStats) {
  const headerRow = document.getElementById('matrix-header-row');
  const bodyRows = document.getElementById('matrix-body-rows');

  headerRow.innerHTML = `
    <th class="col-dev-name">Desenvolvedor</th>
    <th title="Taxa de Aderência em dias úteis">% Aderência</th>
    <th title="Sequência atual de dias úteis com commit">Streak</th>
    ${periodDaysList.map(day => `
      <th class="${day.isWeekend ? 'weekend-header' : ''}">
        <div>${day.weekdayLabel}</div>
        <div style="font-size:0.7rem; color:var(--text-dim);">${day.label}</div>
      </th>
    `).join('')}
  `;

  if (filteredDevStats.length === 0) {
    bodyRows.innerHTML = `
      <tr>
        <td colspan="${3 + periodDaysList.length}" style="text-align:center; padding: 2rem; color: var(--text-muted);">
          Nenhum desenvolvedor encontrado com os filtros aplicados.
        </td>
      </tr>
    `;
    return;
  }

  bodyRows.innerHTML = filteredDevStats.map(item => {
    const initials = item.dev.name.split(' ').map(n => n[0]).slice(0, 2).join('');
    const badgeClass = item.statusCategory === 'compliant' ? 'badge-success' : 
                       item.statusCategory === 'warning' ? 'badge-warning' : 'badge-danger';

    return `
      <tr>
        <td class="col-dev-name">
          <div class="dev-info-cell">
            <div class="dev-avatar-sm">${initials}</div>
            <div>
              <div class="dev-name-text">${escapeHtml(item.dev.name)}</div>
              <div class="dev-email-sub">${escapeHtml(item.dev.team)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${badgeClass}">${item.adherenceRate}%</span>
        </td>
        <td>
          <span style="font-family:var(--font-mono); font-weight:600; color:${item.currentStreak > 0 ? 'var(--color-success)' : 'var(--text-dim)'}">
            🔥 ${item.currentStreak}d
          </span>
        </td>
        ${periodDaysList.map(day => {
          const commits = (state.commitData[item.dev.id] && state.commitData[item.dev.id][day.dateStr]) || 0;
          let cellClass = 'weekend';
          let title = `${day.label} (${day.weekdayLabel}): Fim de semana`;

          if (!day.isWeekend) {
            if (commits > 0) {
              cellClass = 'committed';
              title = `${day.label}: ${commits} commit(s) por ${item.dev.name}`;
            } else {
              cellClass = 'missing';
              title = `${day.label}: Sem commits registrado!`;
            }
          } else if (commits > 0) {
            cellClass = 'committed';
            title = `${day.label}: ${commits} commit(s) (Fim de semana)`;
          }

          return `
            <td class="day-cell">
              <div class="cell-status ${cellClass}" title="${escapeHtml(title)}">
                ${commits > 0 ? commits : ''}
              </div>
            </td>
          `;
        }).join('')}
      </tr>
    `;
  }).join('');
}

// Renderiza Cards Individuais dos Desenvolvedores
function renderDevCardsGrid(filteredDevStats) {
  const grid = document.getElementById('dev-cards-grid');

  if (filteredDevStats.length === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = filteredDevStats.map(item => {
    const initials = item.dev.name.split(' ').map(n => n[0]).slice(0, 2).join('');
    const badgeClass = item.statusCategory === 'compliant' ? 'badge-success' : 
                       item.statusCategory === 'warning' ? 'badge-warning' : 'badge-danger';
    
    const badgeLabel = item.statusCategory === 'compliant' ? 'Conforme' : 
                        item.statusCategory === 'warning' ? 'Atenção' : 'Crítico';

    return `
      <div class="dev-card glass-panel">
        <div class="dev-card-header">
          <div class="dev-card-identity">
            <div class="dev-avatar-lg">${initials}</div>
            <div>
              <h3 style="font-size:1rem; font-weight:600; color:#fff;">${escapeHtml(item.dev.name)}</h3>
              <span style="font-size:0.8rem; color:var(--text-dim);">${escapeHtml(item.dev.email)}</span>
            </div>
          </div>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>

        <div class="dev-card-stats">
          <div class="stat-item">
            <span class="stat-label">Aderência Dias Úteis</span>
            <span class="stat-val" style="color: ${item.adherenceRate >= 80 ? 'var(--color-success)' : item.adherenceRate >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'}">
              ${item.adherenceRate}%
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Sequência (Streak)</span>
            <span class="stat-val">🔥 ${item.currentStreak} dias</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Dias Cumpridos</span>
            <span class="stat-val">${item.workingDaysWithCommits} / ${item.workingDaysTotal}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Commits</span>
            <span class="stat-val">${item.totalCommits}</span>
          </div>
        </div>

        <div class="dev-card-footer">
          <span>Squad: <strong>${escapeHtml(item.dev.team)}</strong></span>
          ${item.missingWorkdaysStreak > 0 ? `
            <span style="color:var(--color-danger); font-weight:500;">
              ⚠️ Sem commit há ${item.missingWorkdaysStreak}d útil
            </span>
          ` : `
            <span style="color:var(--color-success); font-weight:500;">
              ✓ Em dia
            </span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Reseta o Formulário de Desenvolvedores
function resetDevForm() {
  const editIdInput = document.getElementById('edit-dev-id');
  if (editIdInput) editIdInput.value = '';
  const form = document.getElementById('add-dev-form');
  if (form) form.reset();
  const title = document.getElementById('dev-form-title');
  if (title) title.textContent = 'Adicionar Novo Desenvolvedor';
  const submitBtn = document.getElementById('save-dev-submit-btn');
  if (submitBtn) submitBtn.textContent = 'Adicionar Desenvolvedor';
  const cancelBtn = document.getElementById('cancel-dev-edit-btn');
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

// Renderiza a Lista do Modal de Gerenciamento de Devs
function renderManageDevsList() {
  const container = document.getElementById('devs-manage-list');
  if (!container) return;

  container.innerHTML = state.developers.map(dev => `
    <li class="dev-manage-item">
      <div>
        <strong>${escapeHtml(dev.name)}</strong> (${escapeHtml(dev.email)})
        <div style="font-size:0.75rem; color:var(--text-dim);">Squad: ${escapeHtml(dev.team)} | User: @${escapeHtml(dev.username)}</div>
      </div>
      <div style="display:flex; gap:0.4rem; align-items:center;">
        <button class="btn btn-secondary btn-sm" data-edit-dev="${dev.id}" title="Editar Desenvolvedor">
          ✏️
        </button>
        <button class="btn-icon-danger" data-remove-dev="${dev.id}" title="Remover Desenvolvedor">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </li>
  `).join('');

  // Eventos de Editar Dev
  container.querySelectorAll('[data-edit-dev]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-edit-dev');
      const dev = state.developers.find(d => d.id === id);
      if (!dev) return;

      document.getElementById('edit-dev-id').value = dev.id;
      document.getElementById('dev-name-input').value = dev.name;
      document.getElementById('dev-email-input').value = dev.email;
      document.getElementById('dev-username-input').value = dev.username || '';
      document.getElementById('dev-team-input').value = dev.team || '';
      document.getElementById('dev-form-title').textContent = 'Editar Desenvolvedor';
      document.getElementById('save-dev-submit-btn').textContent = 'Atualizar Desenvolvedor';
      document.getElementById('cancel-dev-edit-btn').classList.remove('hidden');

      document.getElementById('dev-name-input').focus();
    });
  });

  // Eventos de Remover Dev
  container.querySelectorAll('[data-remove-dev]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idToRemove = e.currentTarget.getAttribute('data-remove-dev');
      const editId = document.getElementById('edit-dev-id')?.value;
      if (editId === idToRemove) {
        resetDevForm();
      }

      state.developers = state.developers.filter(d => d.id !== idToRemove);

      // Remove referência de projetos vinculados
      state.projects.forEach(p => {
        if (p.devIds) {
          p.devIds = p.devIds.filter(id => id !== idToRemove);
        }
      });
      saveProjectsToStorage();

      saveDevelopersToStorage();
      resetDevForm();
      renderManageDevsList();
      renderManageProjectsList();
      refreshDashboard();
    });
  });
}

// Renderiza a Lista e Formulário no Modal de Gerenciamento de Projetos
function renderManageProjectsList() {
  const container = document.getElementById('projects-manage-list');
  const checkboxContainer = document.getElementById('project-devs-checkbox-container');
  const editId = document.getElementById('edit-project-id').value;

  const currentEditingProject = editId ? state.projects.find(p => p.id === editId) : null;
  const selectedDevIds = currentEditingProject ? (currentEditingProject.devIds || []) : [];

  // Renderiza Checkboxes dos Desenvolvedores
  if (checkboxContainer) {
    checkboxContainer.innerHTML = state.developers.map(dev => {
      const isChecked = selectedDevIds.includes(dev.id);
      return `
        <label class="checkbox-item">
          <input type="checkbox" name="project-dev-cb" value="${dev.id}" ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(dev.name)}</span>
        </label>
      `;
    }).join('');
  }

  // Renderiza Lista de Projetos
  if (container) {
    container.innerHTML = state.projects.map(proj => {
      const devCount = (proj.devIds || []).length;
      const hasCreds = projectHasCredentials(proj);
      const hasOwnCreds = !!(proj.gitlabUrl && proj.gitlabToken);
      const credsBadge = hasOwnCreds 
        ? '<span class="badge badge-success" style="font-size:0.65rem;">Token Próprio</span>'
        : (hasCreds ? '<span class="badge badge-subtle" style="font-size:0.65rem;">Fallback Global</span>' : '<span class="badge badge-danger" style="font-size:0.65rem;">Sem Token</span>');

      const branchBadge = proj.allBranches !== false
        ? '<span class="badge badge-success" style="font-size:0.65rem;" title="Monitorando commits em todas as branches">🌿 Todas as Branches</span>'
        : '<span class="badge badge-subtle" style="font-size:0.65rem;" title="Monitorando apenas a branch padrão">Branch Padrão</span>';

      return `
        <li class="dev-manage-item">
          <div>
            <strong>${escapeHtml(proj.name)}</strong> ${proj.gitlabProjectId ? `<small style="color:var(--text-dim);">(ID GitLab: ${escapeHtml(proj.gitlabProjectId)})</small>` : ''} ${credsBadge} ${branchBadge}
            <div style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(proj.description || 'Sem descrição')} | <strong>${devCount} dev(s) vinculados</strong></div>
          </div>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-secondary btn-sm" data-edit-project="${proj.id}" title="Editar Projeto">
              ✏️
            </button>
            <button class="btn-icon-danger" data-remove-project="${proj.id}" title="Remover Projeto">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </li>
      `;
    }).join('');

    // Eventos de Editar
    container.querySelectorAll('[data-edit-project]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-edit-project');
        const proj = state.projects.find(p => p.id === id);
        if (!proj) return;

        document.getElementById('edit-project-id').value = proj.id;
        document.getElementById('project-name-input').value = proj.name;
        document.getElementById('project-gitlab-id-input').value = proj.gitlabProjectId || '';
        document.getElementById('project-desc-input').value = proj.description || '';
        document.getElementById('project-gitlab-url-input').value = proj.gitlabUrl || '';
        document.getElementById('project-gitlab-token-input').value = proj.gitlabToken || '';
        const allBranchesCb = document.getElementById('project-all-branches-checkbox');
        if (allBranchesCb) allBranchesCb.checked = proj.allBranches !== false;
        document.getElementById('project-form-title').textContent = 'Editar Projeto';
        document.getElementById('save-project-submit-btn').textContent = 'Atualizar Projeto';
        document.getElementById('cancel-project-edit-btn').classList.remove('hidden');
        document.getElementById('project-connection-status').classList.add('hidden');

        renderManageProjectsList();
      });
    });

    // Eventos de Remover
    container.querySelectorAll('[data-remove-project]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idToRemove = e.currentTarget.getAttribute('data-remove-project');
        state.projects = state.projects.filter(p => p.id !== idToRemove);
        
        // Remove projeto das referências dos devs
        state.developers.forEach(dev => {
          if (dev.projectIds) {
            dev.projectIds = dev.projectIds.filter(pid => pid !== idToRemove);
          }
        });

        if (state.selectedProjectId === idToRemove) {
          state.selectedProjectId = 'all';
          saveSelectedProjectToStorage();
        }

        saveProjectsToStorage();
        saveDevelopersToStorage();
        resetProjectForm();
        renderManageProjectsList();
        refreshDashboard();
      });
    });
  }
}

function resetProjectForm() {
  document.getElementById('edit-project-id').value = '';
  document.getElementById('add-project-form').reset();
  const allBranchesCb = document.getElementById('project-all-branches-checkbox');
  if (allBranchesCb) allBranchesCb.checked = true;
  document.getElementById('project-form-title').textContent = 'Adicionar Novo Projeto';
  document.getElementById('save-project-submit-btn').textContent = 'Salvar Projeto';
  document.getElementById('cancel-project-edit-btn').classList.add('hidden');
  const connStatus = document.getElementById('project-connection-status');
  if (connStatus) connStatus.classList.add('hidden');
}

// Configuração do Submit do Formulário de Projeto
document.addEventListener('DOMContentLoaded', () => {
  const addProjectForm = document.getElementById('add-project-form');
  const cancelEditBtn = document.getElementById('cancel-project-edit-btn');

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      resetProjectForm();
      renderManageProjectsList();
    });
  }

  if (addProjectForm) {
    addProjectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const editId = document.getElementById('edit-project-id').value;
      const name = document.getElementById('project-name-input').value.trim();
      const gitlabProjectId = document.getElementById('project-gitlab-id-input').value.trim();
      const description = document.getElementById('project-desc-input').value.trim();
      const gitlabUrl = document.getElementById('project-gitlab-url-input').value.trim().replace(/\/$/, '');
      const gitlabToken = document.getElementById('project-gitlab-token-input').value.trim();
      const allBranches = document.getElementById('project-all-branches-checkbox')?.checked ?? true;

      // Pega IDs dos desenvolvedores marcados nos checkboxes
      const checkedDevBoxes = document.querySelectorAll('input[name="project-dev-cb"]:checked');
      const selectedDevIds = Array.from(checkedDevBoxes).map(cb => cb.value);

      if (!name) return;

      if (editId) {
        // Atualizar Projeto Existente
        const projectIndex = state.projects.findIndex(p => p.id === editId);
        if (projectIndex !== -1) {
          state.projects[projectIndex] = {
            ...state.projects[projectIndex],
            name,
            gitlabProjectId,
            description,
            gitlabUrl,
            gitlabToken,
            allBranches,
            devIds: selectedDevIds
          };
        }
      } else {
        // Criar Novo Projeto
        const newProj = {
          id: 'proj-' + Date.now(),
          name,
          gitlabProjectId,
          description,
          gitlabUrl,
          gitlabToken,
          allBranches,
          devIds: selectedDevIds
        };
        state.projects.push(newProj);
      }

      // Atualiza referências cruzadas nos devs
      const targetProjectId = editId || state.projects[state.projects.length - 1].id;
      state.developers.forEach(dev => {
        if (!dev.projectIds) dev.projectIds = [];
        if (selectedDevIds.includes(dev.id)) {
          if (!dev.projectIds.includes(targetProjectId)) dev.projectIds.push(targetProjectId);
        } else {
          dev.projectIds = dev.projectIds.filter(pid => pid !== targetProjectId);
        }
      });

      saveProjectsToStorage();
      saveDevelopersToStorage();
      resetProjectForm();
      renderManageProjectsList();
      refreshDashboard();
    });
  }

  // Botão Testar Conexão do Projeto
  const testProjConnBtn = document.getElementById('test-project-connection-btn');
  if (testProjConnBtn) {
    testProjConnBtn.addEventListener('click', testProjectConnection);
  }
});

// Testa a conexão de um projeto específico (URL+Token do formulário ou fallback global)
async function testProjectConnection() {
  const urlInput = document.getElementById('project-gitlab-url-input').value.trim().replace(/\/$/, '');
  const tokenInput = document.getElementById('project-gitlab-token-input').value.trim();
  const statusMsg = document.getElementById('project-connection-status');

  // Se nenhum foi informado, usa fallback global
  const url = urlInput || (state.gitlabConfig.url || '').replace(/\/$/, '');
  const token = tokenInput || (state.gitlabConfig.token || '');

  if (!url || !token) {
    statusMsg.className = 'connection-status error';
    statusMsg.textContent = 'Sem credenciais: preencha URL/Token aqui ou configure o fallback global.';
    statusMsg.classList.remove('hidden');
    return;
  }

  statusMsg.className = 'connection-status';
  statusMsg.textContent = 'Testando...';
  statusMsg.classList.remove('hidden');

  try {
    const res = await fetch(`${url}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token }
    });
    if (res.ok) {
      const user = await res.json();
      const source = urlInput && tokenInput ? 'Token Próprio' : 'Fallback Global';
      statusMsg.className = 'connection-status success';
      statusMsg.textContent = `✓ Conectado como ${user.name || user.username} (${source})`;
    } else {
      statusMsg.className = 'connection-status error';
      statusMsg.textContent = `Erro HTTP ${res.status}: verifique a URL e o token.`;
    }
  } catch (err) {
    statusMsg.className = 'connection-status error';
    statusMsg.textContent = `Erro de rede: ${err.message}`;
  }
}

// Exportar Relatório de Aderência em CSV
function exportAdherenceReportCSV() {
  const periodDaysList = getPeriodDaysList(state.periodDays);
  
  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Nome,Email,Squad,Aderencia_Percentual,Dias_Com_Commit,Total_Dias_Uteis,Streak_Atual,Commits_Totais\n';

  state.developers.forEach(dev => {
    let workingDaysTotal = 0;
    let workingDaysWithCommits = 0;
    let totalCommits = 0;
    let currentStreak = 0;
    let isStreakActive = true;

    periodDaysList.forEach(day => {
      const commits = (state.commitData[dev.id] && state.commitData[dev.id][day.dateStr]) || 0;
      totalCommits += commits;

      if (!day.isWeekend) {
        workingDaysTotal++;
        if (commits > 0) workingDaysWithCommits++;
      }
    });

    for (let i = periodDaysList.length - 1; i >= 0; i--) {
      const day = periodDaysList[i];
      if (day.isWeekend) continue;
      const commits = (state.commitData[dev.id] && state.commitData[dev.id][day.dateStr]) || 0;
      if (commits > 0 && isStreakActive) {
        currentStreak++;
      } else {
        isStreakActive = false;
      }
    }

    const rate = workingDaysTotal > 0 ? Math.round((workingDaysWithCommits / workingDaysTotal) * 100) : 0;

    csvContent += `"${dev.name}","${dev.email}","${dev.team}",${rate}%,${workingDaysWithCommits},${workingDaysTotal},${currentStreak},${totalCommits}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `CommitDay_Relatorio_Aderencia_${formatDateKey(new Date())}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Helpers Utilitários
function formatDateKey(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
