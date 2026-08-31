/* ============================================================
 * 技能共享平台 - 主逻辑 v4
 * ============================================================
 * 【可替换图片 - 总说明】
 * 本文件中所有可替换图片的位置都标注了 【可替换图片】 注释。
 * 图片存储方式：
 *   1. 静态图片：放在 images/ 目录，用相对路径引用（如 images/logo.png）
 *   2. 用户上传图片：自动转为 base64 存在 localStorage，刷新不丢失
 *   3. 上线后：将 localStorage 替换为后端API调用，图片上传到云存储（如Cloudflare R2）
 * ============================================================ */

// ========== 数据版本（变更后自动清空旧数据） ==========
const DATA_VERSION = 'v4';

// ========== 前端版本检查：代码更新后自动强制刷新一次，避免设备用旧缓存JS调新接口而静默失败 ==========
const APP_VERSION = 'v20260902d';
try {
    if (localStorage.getItem('sp_app_version') !== APP_VERSION) {
        localStorage.setItem('sp_app_version', APP_VERSION);
        if (!/[?&]v=/.test(location.search)) {
            location.replace(location.pathname + '?v=' + encodeURIComponent(APP_VERSION) + location.hash);
        }
    }
} catch (e) { /* 隐私模式下localStorage不可用时忽略 */ }

// ========== 分类配置（每类末尾加"其他"） ==========
const CATEGORIES = {
    digital: {
        name: '线上数字服务',
        desc: '剪辑·PPT·设计·编程·文案',
        // 【可替换图片】分类图标路径，替换 images/cat-digital.png 即可
        icon: 'images/cat-digital.png',
        iconEmoji: '💻',
        subs: [
            { name: '短视频剪辑', icon: '🎬' },
            { name: 'PPT制作', icon: '📊' },
            { name: '平面设计', icon: '🎨' },
            { name: 'UI设计', icon: '📱' },
            { name: '编程开发', icon: '💻' },
            { name: '文案写作', icon: '✍️' },
            { name: '翻译配音', icon: '🎙️' },
            { name: '数据处理', icon: '📈' },
            { name: '其他', icon: '✨' }
        ]
    },
    handmade: {
        name: '手作实物定制',
        desc: '饰品·滴胶·手绘·编织·皮具',
        // 【可替换图片】分类图标路径
        icon: 'images/cat-handmade.png',
        iconEmoji: '🎨',
        subs: [
            { name: '手工饰品', icon: '💍' },
            { name: '滴胶作品', icon: '💧' },
            { name: '羊毛毡', icon: '🐑' },
            { name: '手绘定制', icon: '🖌️' },
            { name: '编织钩针', icon: '🧶' },
            { name: '皮具手作', icon: '👜' },
            { name: '印章篆刻', icon: '🔖' },
            { name: '文创周边', icon: '🎁' },
            { name: '其他', icon: '✨' }
        ]
    },
    local: {
        name: '同城线下劳务',
        desc: '摄影·跑腿·家教·陪练·化妆',
        // 【可替换图片】分类图标路径
        icon: 'images/cat-local.png',
        iconEmoji: '📍',
        subs: [
            { name: '摄影跟拍', icon: '📷' },
            { name: '跑腿代办', icon: '🏃' },
            { name: '家教辅导', icon: '📚' },
            { name: '乐器陪练', icon: '🎸' },
            { name: '健身指导', icon: '💪' },
            { name: '化妆造型', icon: '💄' },
            { name: '搬家搬运', icon: '📦' },
            { name: '活动协助', icon: '🎉' },
            { name: '其他', icon: '✨' }
        ]
    },
    cooperate: {
        name: '多人共创项目',
        desc: '组队·项目·竞赛·创业',
        // 【可替换图片】分类图标路径
        icon: 'images/cat-cooperate.png',
        iconEmoji: '🤝',
        subs: []
    }
};

// ========== 数据库操作（localStorage 模拟） ==========
const DB = {
    get(key, def) {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
        catch(e) { return def; }
    },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
    remove(key) { localStorage.removeItem(key); }
};

// ========== 全局状态 ==========
let currentUser = null;
let currentRole = 'user'; // user / tech
let currentPage = 'home';
let carouselIndex = 0;
let carouselTimer = null;
let currentCategory = null;
let currentSubCategory = null;
let currentOrderTab = 'received';
let currentChatKey = null; // 当前聊天对象：对方用户id（字符串）
let uploadState = { serviceCover: null, serviceSamples: [], taskFiles: [], regAvatar: null };

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    initData();
    loadSession();
    initCarousel();
    initScrollReveal();
    renderAll();
    updateNavRole();
    // 注册时用户类型切换显示技能标签
    document.getElementById('regUserType').addEventListener('change', function() {
        document.getElementById('regSkillGroup').style.display = this.value === '1' ? 'block' : 'none';
    });
});

// ========== 数据初始化（预置测试数据） ==========
function initData() {
    if (DB.get('sp_version') !== DATA_VERSION) {
        // 版本变更，清空旧数据
        ['sp_users','sp_services','sp_orders','sp_tasks','sp_projects','sp_notifications','sp_current_user','sp_role'].forEach(k => DB.remove(k));
        DB.set('sp_version', DATA_VERSION);

        // 预置用户
        const users = [
            { id:1, username:'editor01', password:'123456', real_name:'张剪辑', user_type:1, skill_tag:'剪辑,调色,字幕', phone:'13800000001', avatar:null, created_at:Date.now() },
            { id:2, username:'designer01', password:'123456', real_name:'李设计', user_type:1, skill_tag:'设计,UI,插画', phone:'13800000002', avatar:null, created_at:Date.now() },
            { id:3, username:'customer01', password:'123456', real_name:'王客户', user_type:0, skill_tag:'', phone:'13800000003', avatar:null, created_at:Date.now() },
            { id:4, username:'photo01', password:'123456', real_name:'赵摄影', user_type:1, skill_tag:'摄影,修图,跟拍', phone:'13800000004', avatar:null, created_at:Date.now() },
            { id:5, username:'handmade01', password:'123456', real_name:'陈手作', user_type:1, skill_tag:'手工,滴胶,编织', phone:'13800000005', avatar:null, created_at:Date.now() },
            { id:6, username:'tutor01', password:'123456', real_name:'刘家教', user_type:1, skill_tag:'家教,数学,物理', phone:'13800000006', avatar:null, created_at:Date.now() },
            { id:7, username:'code01', password:'123456', real_name:'孙程序', user_type:1, skill_tag:'编程,前端,Python', phone:'13800000007', avatar:null, created_at:Date.now() }
        ];
        DB.set('sp_users', users);

        // 预置服务
        const services = [
            { id:1, user_id:1, title:'短视频剪辑与后期', service_desc:'提供短视频剪辑、字幕添加、BGM配乐、调色服务，支持抖音/小红书/B站等平台格式输出，24小时内交付。', price:80, service_type:'线上数字服务', sub_category:'短视频剪辑', tags:['剪辑','调色','字幕'], cover:'images/task-clip.jpg', sample:[], status:1, created_at:Date.now() },
            { id:2, user_id:2, title:'PPT定制美化设计', service_desc:'专业PPT设计，涵盖答辩、汇报、商业计划书等场景，提供模板定制、内容排版、动画效果，可加急交付。', price:150, service_type:'线上数字服务', sub_category:'PPT制作', tags:['PPT','设计','排版'], cover:'images/task-ppt.jpg', sample:[], status:1, created_at:Date.now() },
            { id:3, user_id:4, title:'校园活动跟拍摄影', service_desc:'杭州同城线下摄影服务，覆盖校园活动、毕业照、人像写真，提供精修20张+原片全送，需提前3天预约。', price:300, service_type:'同城线下劳务', sub_category:'摄影跟拍', tags:['摄影','跟拍','修图'], cover:'images/task-photo.jpg', sample:[], status:1, created_at:Date.now() },
            { id:4, user_id:5, title:'手工滴胶饰品定制', service_desc:'纯手工滴胶饰品定制，可做钥匙扣、书签、吊坠等，支持来图定制、颜色自选，3-5天交付。', price:50, service_type:'手作实物定制', sub_category:'滴胶作品', tags:['手工','滴胶','定制'], cover:'images/task-handmade.jpg', sample:[], status:1, created_at:Date.now() },
            { id:5, user_id:2, title:'海报/宣传单平面设计', service_desc:'专业平面设计，涵盖海报、宣传单、名片、公众号配图等，提供3版修改，源文件交付。', price:120, service_type:'线上数字服务', sub_category:'平面设计', tags:['设计','海报','排版'], cover:'images/task-design.jpg', sample:[], status:1, created_at:Date.now() },
            { id:6, user_id:7, title:'Python脚本/小程序开发', service_desc:'Python自动化脚本、数据处理、爬虫、微信小程序开发，可提供源码和注释，支持后续维护。', price:200, service_type:'线上数字服务', sub_category:'编程开发', tags:['编程','Python','前端'], cover:'images/task-code.jpg', sample:[], status:1, created_at:Date.now() },
            { id:7, user_id:6, title:'高数/大物家教辅导', service_desc:'大一高等数学、大学物理家教辅导，可线上/线下，擅长期末冲刺、知识点梳理，提分明显。', price:80, service_type:'同城线下劳务', sub_category:'家教辅导', tags:['家教','数学','物理'], cover:'images/task-ppt.jpg', sample:[], status:1, created_at:Date.now() },
            { id:8, user_id:1, title:'Vlog/旅拍视频剪辑', service_desc:'Vlog、旅拍、生活记录视频剪辑，支持4K输出，包含调色、转场、字幕、BGM，风格可定制。', price:120, service_type:'线上数字服务', sub_category:'短视频剪辑', tags:['剪辑','Vlog','调色'], cover:'images/task-clip.jpg', sample:[], status:1, created_at:Date.now() }
        ];
        DB.set('sp_services', services);

        // 预置任务（10+条，带AI封面）
        const tasks = [
            { id:1, title:'需要剪辑一条1分钟社团招新视频', budget:100, task_type:'线上数字服务', sub_category:'短视频剪辑', deadline:'3天内', desc:'社团招新视频，素材已拍好约20分钟，需要剪成1分钟左右的招新宣传片，加字幕和BGM。', publisher_id:3, taker_id:null, status:0, cover:'images/task-clip.jpg', attachments:[], created_at:Date.now() },
            { id:2, title:'求一份挑战杯答辩PPT美化', budget:200, task_type:'线上数字服务', sub_category:'PPT制作', deadline:'下周三前', desc:'挑战杯项目答辩PPT，内容已有初稿约15页，需要美化设计，统一风格，加动画，适合现场答辩。', publisher_id:3, taker_id:null, status:0, cover:'images/task-ppt.jpg', attachments:[], created_at:Date.now() },
            { id:3, title:'杭州下沙毕业照跟拍半天', budget:250, task_type:'同城线下劳务', sub_category:'摄影跟拍', deadline:'本周六', desc:'4人宿舍毕业照，在下沙校区拍摄半天，需要精修15张，原片全送。', publisher_id:3, taker_id:null, status:0, cover:'images/task-photo.jpg', attachments:[], created_at:Date.now() },
            { id:4, title:'求做一个社团活动海报', budget:60, task_type:'线上数字服务', sub_category:'平面设计', deadline:'2天内', desc:'社团迎新活动海报，A3尺寸，需要包含活动时间地点、报名方式，风格活泼年轻。', publisher_id:3, taker_id:null, status:0, cover:'images/task-design.jpg', attachments:[], created_at:Date.now() },
            { id:5, title:'Python数据处理小脚本', budget:150, task_type:'线上数字服务', sub_category:'编程开发', deadline:'一周内', desc:'需要一个Python脚本，批量处理Excel数据，做格式转换和统计，输出汇总表格。', publisher_id:3, taker_id:null, status:0, cover:'images/task-code.jpg', attachments:[], created_at:Date.now() },
            { id:6, title:'定制一对滴胶耳坠送女友', budget:80, task_type:'手作实物定制', sub_category:'滴胶作品', deadline:'5天内', desc:'想要一对星空风格的滴胶耳坠，蓝紫色调，带金箔，送女友生日礼物，需要礼盒包装。', publisher_id:3, taker_id:null, status:0, cover:'images/task-handmade.jpg', attachments:[], created_at:Date.now() },
            { id:7, title:'高数期末考前辅导2次', budget:160, task_type:'同城线下劳务', sub_category:'家教辅导', deadline:'两周内', desc:'大一上高数期末考前辅导，每周2次每次2小时，重点梳理极限、导数、积分，线下或线上均可。', publisher_id:3, taker_id:null, status:0, cover:'images/task-ppt.jpg', attachments:[], created_at:Date.now() },
            { id:8, title:'公众号文章排版+封面设计', budget:90, task_type:'线上数字服务', sub_category:'文案写作', deadline:'3天内', desc:'校园公众号推文，内容已写好约2000字，需要排版美化+设计封面图，风格清新文艺。', publisher_id:3, taker_id:null, status:0, cover:'images/task-design.jpg', attachments:[], created_at:Date.now() },
            { id:9, title:'帮忙跑腿取快递送到寝室', budget:15, task_type:'同城线下劳务', sub_category:'跑腿代办', deadline:'今天下午', desc:'菜鸟驿站有3个快递，帮忙取一下送到XX寝室楼，快递不算大。', publisher_id:3, taker_id:null, status:0, cover:'images/task-photo.jpg', attachments:[], created_at:Date.now() },
            { id:10, title:'吉他入门陪练4节课', budget:200, task_type:'同城线下劳务', sub_category:'乐器陪练', deadline:'一个月内', desc:'吉他零基础，想找个人陪练入门，每周1次每次1小时，线下教学，我有吉他。', publisher_id:3, taker_id:null, status:0, cover:'images/task-handmade.jpg', attachments:[], created_at:Date.now() },
            { id:11, title:'手工编织毛线围巾定制', budget:120, task_type:'手作实物定制', sub_category:'编织钩针', deadline:'两周内', desc:'想要一条粗毛线围巾，藏青色，送男生，长度180cm左右，纯手工编织。', publisher_id:3, taker_id:null, status:0, cover:'images/task-handmade.jpg', attachments:[], created_at:Date.now() },
            { id:12, title:'英语四级作文批改+讲解', budget:50, task_type:'线上数字服务', sub_category:'翻译配音', deadline:'随时', desc:'写了5篇四级作文，希望帮忙批改语法错误并讲解提分技巧，线上沟通即可。', publisher_id:3, taker_id:null, status:0, cover:'images/task-code.jpg', attachments:[], created_at:Date.now() }
        ];
        DB.set('sp_tasks', tasks);

        // 预置共创项目
        const projects = [
            { id:1, project_name:'校园短视频创作团队', project_desc:'组建一支校园短视频创作团队，共同打造校园生活类短视频，分工包括编剧、拍摄、剪辑、运营，收益按贡献分配。', creator_id:1, total_budget:500, status:'recruiting', members:[{user_id:1,role:'发起人/剪辑'}], need_skills:['编剧','拍摄','运营'], created_at:Date.now() },
            { id:2, project_name:'大创比赛PPT与答辩支持', project_desc:'为参加大创比赛的团队提供PPT制作、答辩模拟、视觉设计支持，需要设计和演讲能力的同学加入。', creator_id:2, total_budget:300, status:'recruiting', members:[{user_id:2,role:'发起人/设计'}], need_skills:['PPT设计','答辩','文案'], created_at:Date.now() }
        ];
        DB.set('sp_projects', projects);

        DB.set('sp_orders', []);
        DB.set('sp_notifications', []);
    }
}

// ========== 会话加载 ==========
function loadSession() {
    currentUser = DB.get('sp_current_user', null);
    currentRole = DB.get('sp_role', 'user');
    if (currentUser && currentUser.token) {
        // 后台从服务端刷新用户资料（服务端是唯一数据源，如头像/昵称被修改）
        fetch(API_BASE + '/me', { headers: { 'Authorization': 'Bearer ' + currentUser.token } })
            .then(res => res.ok ? res.json() : null)
            .then(u => {
                if (!u) return;
                currentUser = Object.assign({}, u, { token: currentUser.token });
                DB.set('sp_current_user', currentUser);
                renderUserArea();
            })
            .catch(() => {});
    }
}

// ========== 渲染所有 ==========
function renderAll() {
    renderUserArea();
    renderHome();
    renderOrders();
    renderMessages();
    updateBadges();
}

// ========== 用户区域渲染 ==========
function renderUserArea() {
    const userArea = document.getElementById('userArea');
    const userInfo = document.getElementById('userInfo');
    if (currentUser) {
        userArea.style.display = 'none';
        userInfo.style.display = 'flex';
        document.getElementById('userName').textContent = currentUser.real_name || currentUser.username;
        const avatarImg = document.getElementById('userAvatarImg');
        const avatarSpan = document.getElementById('userAvatar');
        if (currentUser.avatar) {
            avatarImg.src = currentUser.avatar;
            avatarImg.style.display = 'block';
            avatarSpan.style.display = 'none';
        } else {
            avatarImg.style.display = 'none';
            avatarSpan.style.display = 'flex';
            avatarSpan.textContent = (currentUser.real_name || currentUser.username).charAt(0);
        }
    } else {
        userArea.style.display = 'flex';
        userInfo.style.display = 'none';
    }
}

// ========== 导航角色切换 ==========
function updateNavRole() {
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === currentRole);
    });
    document.querySelectorAll('.nav-user-only').forEach(el => el.style.display = currentRole === 'user' ? '' : 'none');
    document.querySelectorAll('.nav-tech-only').forEach(el => el.style.display = currentRole === 'tech' ? '' : 'none');
}

function switchRole(role) {
    if (role === currentRole) return;
    currentRole = role;
    DB.set('sp_role', role);
    updateNavRole();
    // 如果当前在用户端专属页面，切换后回首页
    if (role === 'tech' && document.getElementById('page-service-market').classList.contains('active')) switchPage('home');
    else if (role === 'user' && (document.getElementById('page-market').classList.contains('active') || document.getElementById('page-tech-hall').classList.contains('active') || document.getElementById('page-publish').classList.contains('active'))) switchPage('home');
    else if (document.getElementById('page-home').classList.contains('active')) renderHome();
    showToast(role === 'user' ? '已切换到用户端' : '已切换到技术端', 'success');
}

// ========== 页面切换 ==========
function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');
    currentPage = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 页面特定渲染
    if (page === 'home') renderHome();
    if (page === 'market') renderMarket();
    if (page === 'tech-hall') renderTechHall();
    if (page === 'cooperate') renderCooperate();
    if (page === 'orders') { renderOrders(); clearOrderNotifications(); }
    if (page === 'messages') {
        renderMessages();
        updateBadges();
        loadGroupData().then(() => { if (currentPage === 'messages') renderMessages(); });
    }
    if (page === 'service-market') renderServiceMarket();

    setTimeout(initScrollReveal, 100);
}

// ========== 首页渲染 ==========
function renderHome() {
    const role = currentRole;
    // 用户端显示平台服务，技术端显示服务分类+热门服务
    document.getElementById('homeUserSection').style.display = role === 'user' ? 'block' : 'none';
    document.getElementById('homeTechSection').style.display = role === 'tech' ? 'block' : 'none';
    document.getElementById('homeTechServiceSection').style.display = role === 'tech' ? 'block' : 'none';

    // 渲染分类网格（用户端和技术端都用）
    const gridId = role === 'user' ? 'homeUserCategoryGrid' : 'homeTechCategoryGrid';
    renderCategoryGrid(gridId, role === 'user' ? 'service-market' : 'category');

    // 热门服务（技术端）
    if (role === 'tech') {
        const services = DB.get('sp_services', []).filter(s => s.status === 1).slice(0, 6);
        document.getElementById('homeServiceGrid').innerHTML = services.map(s => serviceCardHTML(s)).join('') || '<p style="color:#8D87A3;">暂无服务</p>';
    }

    // 共创项目预览
    const projects = DB.get('sp_projects', []).slice(0, 3);
    document.getElementById('homeProjectGrid').innerHTML = projects.map(p => projectCardHTML(p)).join('') || '<p style="color:#8D87A3;">暂无项目</p>';
}

// ========== 分类网格渲染 ==========
function renderCategoryGrid(gridId, target) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
        const iconHtml = cat.icon
            ? `<img src="${cat.icon}" class="category-icon" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
            : '';
        return `<div class="category-card" onclick="handleCategoryClick('${key}','${target}')">
            ${iconHtml}
            <span class="category-icon-emoji" style="display:none;">${cat.iconEmoji}</span>
            <div class="category-info">
                <div class="category-name">${cat.name}</div>
                <div class="category-desc">${cat.desc}</div>
            </div>
            <span class="category-arrow">→</span>
        </div>`;
    }).join('');
}

function handleCategoryClick(key, target) {
    if (key === 'cooperate') { switchPage('cooperate'); return; }
    currentCategory = key;
    currentSubCategory = null;
    if (target === 'service-market') {
        // 用户端从服务市场进入分类详情
        switchPage('category');
        renderCategoryDetail('user');
    } else {
        switchPage('category');
        renderCategoryDetail('tech');
    }
}

// ========== 分类详情页 ==========
function renderCategoryDetail(mode) {
    const cat = CATEGORIES[currentCategory];
    if (!cat) return;
    document.getElementById('categoryTitle').textContent = cat.name;
    document.getElementById('categoryDesc').textContent = mode === 'user' ? '选择具体的服务类型，查看相关服务' : '选择具体的服务类型';

    // 子分类
    const subGrid = document.getElementById('subcategoryGrid');
    if (cat.subs.length > 0) {
        subGrid.style.display = 'grid';
        subGrid.innerHTML = cat.subs.map(sub => {
            const count = mode === 'user'
                ? DB.get('sp_services', []).filter(s => s.service_type === cat.name && s.sub_category === sub.name && s.status === 1).length
                : DB.get('sp_tasks', []).filter(t => t.task_type === cat.name && t.sub_category === sub.name && t.status === 0).length;
            return `<div class="subcategory-card ${currentSubCategory === sub.name ? 'active' : ''}" onclick="selectSubCategory('${sub.name}','${mode}')">
                <div class="subcategory-icon">${sub.icon}</div>
                <div class="subcategory-name">${sub.name}</div>
                <div class="subcategory-count">${count}个${mode === 'user' ? '服务' : '任务'}</div>
            </div>`;
        }).join('');
    } else {
        subGrid.style.display = 'none';
    }

    // 服务/任务列表
    const section = document.getElementById('categoryServiceSection');
    const grid = document.getElementById('categoryServiceGrid');
    const title = document.getElementById('categoryServiceTitle');
    if (mode === 'user') {
        let services = DB.get('sp_services', []).filter(s => s.service_type === cat.name && s.status === 1);
        if (currentSubCategory) services = services.filter(s => s.sub_category === currentSubCategory);
        title.textContent = currentSubCategory ? `${currentSubCategory} - 全部服务` : '全部服务';
        section.style.display = services.length > 0 ? 'block' : 'none';
        grid.innerHTML = services.map(s => serviceCardHTML(s)).join('');
    } else {
        let tasks = DB.get('sp_tasks', []).filter(t => t.task_type === cat.name && t.status === 0);
        if (currentSubCategory) tasks = tasks.filter(t => t.sub_category === currentSubCategory);
        title.textContent = currentSubCategory ? `${currentSubCategory} - 全部任务` : '全部任务';
        section.style.display = tasks.length > 0 ? 'block' : 'none';
        grid.innerHTML = tasks.map(t => taskCardHTML(t)).join('');
    }
}

function selectSubCategory(name, mode) {
    currentSubCategory = currentSubCategory === name ? null : name;
    renderCategoryDetail(mode);
}

function goBackFromCategory() {
    if (currentRole === 'user') switchPage('service-market');
    else switchPage('home');
}

// ========== 服务市场（用户端） ==========
function renderServiceMarket() {
    renderCategoryGrid('serviceMarketGrid', 'service-market');
}

// ========== 技能市场（技术端） ==========
let marketFilter = 'all';
let marketSort = 'default';
function renderMarket() {
    let services = DB.get('sp_services', []).filter(s => s.status === 1);
    if (marketFilter !== 'all') services = services.filter(s => s.service_type === marketFilter);
    if (marketSort === 'price-asc') services.sort((a,b) => a.price - b.price);
    else if (marketSort === 'price-desc') services.sort((a,b) => b.price - a.price);
    else if (marketSort === 'newest') services.sort((a,b) => b.created_at - a.created_at);
    document.getElementById('marketServiceGrid').innerHTML = services.map(s => serviceCardHTML(s)).join('');
    document.getElementById('marketEmpty').style.display = services.length === 0 ? 'block' : 'none';
}
function filterMarket(cat) { marketFilter = cat; document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat)); renderMarket(); }
function sortMarket(val) { marketSort = val; renderMarket(); }

// ========== 接单大厅（技术端） ==========
let techHallCategory = null;
let techHallSubCategory = null;
function renderTechHall() {
    renderCategoryGrid('techHallCategoryGrid', 'tech-hall');
    // 子分类区域
    const subSection = document.getElementById('techHallSubSection');
    const subGrid = document.getElementById('techHallSubGrid');
    if (techHallCategory && CATEGORIES[techHallCategory].subs.length > 0) {
        subSection.style.display = 'block';
        document.getElementById('techHallSubTitle').textContent = CATEGORIES[techHallCategory].name + ' - 具体类型';
        subGrid.innerHTML = CATEGORIES[techHallCategory].subs.map(sub => {
            const count = DB.get('sp_tasks', []).filter(t => t.task_type === CATEGORIES[techHallCategory].name && t.sub_category === sub.name && t.status === 0).length;
            return `<div class="subcategory-card ${techHallSubCategory === sub.name ? 'active' : ''}" onclick="selectTechHallSub('${sub.name}')">
                <div class="subcategory-icon">${sub.icon}</div>
                <div class="subcategory-name">${sub.name}</div>
                <div class="subcategory-count">${count}个任务</div>
            </div>`;
        }).join('');
    } else {
        subSection.style.display = 'none';
    }
    // 任务列表
    let tasks = DB.get('sp_tasks', []).filter(t => t.status === 0);
    if (techHallCategory) tasks = tasks.filter(t => t.task_type === CATEGORIES[techHallCategory].name);
    if (techHallSubCategory) tasks = tasks.filter(t => t.sub_category === techHallSubCategory);
    document.getElementById('techHallTaskTitle').textContent = techHallSubCategory ? `${techHallSubCategory} - 任务列表` : techHallCategory ? `${CATEGORIES[techHallCategory].name} - 全部任务` : '全部需求任务';
    document.getElementById('taskGrid').innerHTML = tasks.map(t => taskCardHTML(t)).join('');
    document.getElementById('taskEmpty').style.display = tasks.length === 0 ? 'block' : 'none';
}
// 重写分类点击用于接单大厅
const origHandleCategoryClick = handleCategoryClick;
handleCategoryClick = function(key, target) {
    if (target === 'tech-hall') {
        if (key === 'cooperate') { switchPage('cooperate'); return; }
        techHallCategory = techHallCategory === key ? null : key;
        techHallSubCategory = null;
        renderTechHall();
    } else {
        origHandleCategoryClick(key, target);
    }
};
function selectTechHallSub(name) {
    techHallSubCategory = techHallSubCategory === name ? null : name;
    renderTechHall();
}

// ========== 服务卡片HTML ==========
function serviceCardHTML(s) {
    const users = DB.get('sp_users', []);
    const seller = users.find(u => u.id === s.user_id);
    const coverHtml = s.cover
        ? `<img src="${s.cover}" onerror="this.parentElement.innerHTML='<div class=\\'service-cover\\'>📄</div>'">`
        : '📄';
    return `<div class="service-card" onclick="showServiceDetail(${s.id})">
        <div class="service-cover">${coverHtml}<span class="service-tag-badge">${s.service_type}</span></div>
        <div class="service-body">
            <div class="service-title">${s.title}</div>
            <div class="service-desc">${s.service_desc}</div>
            <div class="service-tags">${(s.tags||[]).map(t => `<span class="service-tag">${t}</span>`).join('')}</div>
            <div class="service-footer">
                <div class="service-price">¥${s.price}<small>/次</small></div>
                <div class="service-seller">
                    <span class="service-seller-avatar">${(seller?.real_name || seller?.username || '?').charAt(0)}</span>
                    <span class="service-seller-name">${seller?.real_name || seller?.username || '未知'}</span>
                </div>
            </div>
        </div>
    </div>`;
}

// ========== 任务卡片HTML ==========
function taskCardHTML(t) {
    const users = DB.get('sp_users', []);
    const publisher = users.find(u => u.id === t.publisher_id);
    const coverHtml = t.cover ? `<img src="${t.cover}" onerror="this.style.display='none'">` : '📋';
    const canTake = currentUser && currentUser.id !== t.publisher_id && t.status === 0;
    return `<div class="task-card">
        <div class="task-cover">${coverHtml}</div>
        <div class="task-body">
            <div class="task-header">
                <div class="task-title">${t.title}</div>
                <div class="task-budget">¥${t.budget}</div>
            </div>
            <div class="task-meta">
                <span class="task-meta-item">📁 ${t.task_type}</span>
                ${t.sub_category ? `<span class="task-meta-item">🏷️ ${t.sub_category}</span>` : ''}
                ${t.deadline ? `<span class="task-meta-item">⏰ ${t.deadline}</span>` : ''}
            </div>
            <div class="task-desc">${t.desc}</div>
            <div class="task-footer">
                <span class="task-publisher">发布者：${publisher?.real_name || publisher?.username || '未知'}</span>
                ${canTake ? `<button class="task-take-btn" onclick="takeTask(${t.id})">接单</button>` :
                  t.status === 1 ? `<span class="task-taken">已接单</span>` : ''}
            </div>
        </div>
    </div>`;
}

// ========== 项目卡片HTML ==========
function projectCardHTML(p) {
    const statusMap = { recruiting: { text:'招募中', cls:'recruiting' }, 'in-progress': { text:'进行中', cls:'in-progress' }, completed: { text:'已完成', cls:'completed' } };
    const st = statusMap[p.status] || statusMap.recruiting;
    const membersHtml = (p.members || []).slice(0, 4).map((m, i) => {
        const users = DB.get('sp_users', []);
        const u = users.find(x => x.id === m.user_id);
        return `<div class="project-member-avatar" style="z-index:${10-i}">${(u?.real_name || u?.username || '?').charAt(0)}</div>`;
    }).join('');
    return `<div class="project-card" onclick="showProjectDetail(${p.id})">
        <div class="project-header">
            <div class="project-name">${p.project_name}</div>
            <span class="project-status ${st.cls}">${st.text}</span>
        </div>
        <div class="project-desc">${p.project_desc}</div>
        <div class="project-footer">
            <div class="project-members">${membersHtml}</div>
            <div class="project-budget">${p.total_budget ? '¥'+p.total_budget : '面议'}</div>
        </div>
    </div>`;
}

// ========== 服务详情 ==========
function showServiceDetail(id) {
    const services = DB.get('sp_services', []);
    const s = services.find(x => x.id === id);
    if (!s) return;
    const users = DB.get('sp_users', []);
    const seller = users.find(u => u.id === s.user_id);
    const coverHtml = s.cover ? `<img src="${s.cover}" onerror="this.style.display='none'">` : '📄';
    const samplesHtml = (s.sample && s.sample.length > 0) ? s.sample.map(f => fileItemHTML(f)).join('') : '<p style="color:#8D87A3;font-size:13px;">暂无作品样例</p>';
    document.getElementById('detailTitle').textContent = s.title;
    document.getElementById('detailBody').innerHTML = `
        <div class="detail-cover">${coverHtml}</div>
        <div class="detail-price">¥${s.price}<small style="font-size:14px;font-weight:400;color:#8D87A3;">/次</small></div>
        <div class="detail-meta">
            <span class="detail-meta-item">👤 ${seller?.real_name || seller?.username || '未知'}</span>
            <span class="detail-meta-item">📁 ${s.service_type}</span>
            ${s.sub_category ? `<span class="detail-meta-item">🏷️ ${s.sub_category}</span>` : ''}
        </div>
        <div class="detail-section"><h4>服务详情</h4><p>${s.service_desc}</p></div>
        <div class="detail-section"><h4>技能标签</h4><div class="detail-tags">${(s.tags||[]).map(t => `<span class="service-tag">${t}</span>`).join('')}</div></div>
        <div class="detail-section"><h4>作品样例</h4><div class="detail-samples">${samplesHtml}</div></div>
        <div class="detail-actions">
            ${currentUser && currentUser.id !== s.user_id ? `<button class="btn-primary" onclick="orderService(${s.id})">立即下单</button>` : ''}
            ${currentUser && currentUser.id !== s.user_id ? `<button class="btn-ghost" onclick="openChatWithUser(${s.user_id},'service_${s.id}')">💬 联系卖家</button>` : ''}
            <button class="btn-ghost" onclick="closeModal('serviceDetailModal')">关闭</button>
        </div>`;
    openModal('serviceDetailModal');
}

// ========== 文件项HTML（用于详情展示） ==========
function fileItemHTML(f) {
    if (!f) return '';
    if (f.type && f.type.startsWith('image/')) {
        return `<div class="detail-sample"><img src="${f.data}" alt="${f.name}"></div>`;
    }
    const icon = f.type?.includes('video') ? '🎬' : f.type?.includes('audio') ? '🎵' : f.type?.includes('pdf') ? '📕' : f.type?.includes('word') || f.name?.endsWith('.doc') || f.name?.endsWith('.docx') ? '📘' : f.name?.endsWith('.xls') || f.name?.endsWith('.xlsx') ? '📗' : f.name?.endsWith('.zip') ? '🗜️' : '📄';
    return `<div class="detail-file-item"><span class="detail-file-icon">${icon}</span><span class="detail-file-name">${f.name || '文件'}</span></div>`;
}

// ========== 下单服务 ==========
function orderService(serviceId) {
    if (!currentUser) { showLoginModal(); return; }
    const services = DB.get('sp_services', []);
    const s = services.find(x => x.id === serviceId);
    if (!s) return;
    if (s.user_id === currentUser.id) { showToast('不能购买自己的服务', 'error'); return; }
    const orders = DB.get('sp_orders', []);
    const newOrder = { id: Date.now(), service_id: s.id, buyer_id: currentUser.id, seller_id: s.user_id, order_price: s.price, order_status: 0, demand_text: '', created_at: Date.now() };
    orders.push(newOrder);
    DB.set('sp_orders', orders);
    // 通知卖家
    addNotification(s.user_id, 'new_order', `您有新订单：${s.title}`);
    // 创建对话
    ensureChat('service_' + s.id, 'private', s.user_id, currentUser.id, s.title);
    showToast('下单成功！', 'success');
    closeModal('serviceDetailModal');
    switchPage('orders');
}

// ========== 接单 ==========
function takeTask(taskId) {
    if (!currentUser) { showLoginModal(); return; }
    const tasks = DB.get('sp_tasks', []);
    const t = tasks.find(x => x.id === taskId);
    if (!t || t.status !== 0) return;
    if (t.publisher_id === currentUser.id) { showToast('不能接自己发布的任务', 'error'); return; }
    t.taker_id = currentUser.id;
    t.status = 1; // 进行中
    DB.set('sp_tasks', tasks);
    // 通知发布者
    addNotification(t.publisher_id, 'task_taken', `您的任务"${t.title}"已被接单`);
    // 创建对话
    ensureChat('task_' + t.id, 'private', t.publisher_id, currentUser.id, t.title);
    showToast('接单成功！请在消息中联系发布者', 'success');
    renderTechHall();
    updateBadges();
}

// ========== 共创项目 ==========
function renderCooperate() {
    const projects = DB.get('sp_projects', []);
    document.getElementById('cooperateGrid').innerHTML = projects.map(p => projectCardHTML(p)).join('');
    document.getElementById('cooperateEmpty').style.display = projects.length === 0 ? 'block' : 'none';
}

function showCreateProjectModal() {
    if (!currentUser) { showLoginModal(); return; }
    document.getElementById('projectName').value = '';
    document.getElementById('projectDesc').value = '';
    document.getElementById('projectBudget').value = '';
    document.getElementById('projectMembers').value = '';
    document.getElementById('projectSkills').value = '';
    openModal('createProjectModal');
}

function submitProject(e) {
    e.preventDefault();
    const projects = DB.get('sp_projects', []);
    const newProject = {
        id: Date.now(),
        project_name: document.getElementById('projectName').value,
        project_desc: document.getElementById('projectDesc').value,
        creator_id: currentUser.id,
        total_budget: parseFloat(document.getElementById('projectBudget').value) || 0,
        status: 'recruiting',
        members: [{ user_id: currentUser.id, role: '发起人' }],
        need_skills: document.getElementById('projectSkills').value.split(',').map(s => s.trim()).filter(Boolean),
        created_at: Date.now()
    };
    projects.push(newProject);
    DB.set('sp_projects', projects);
    // 自动创建群聊
    ensureChat('group_' + newProject.id, 'group', null, null, newProject.project_name, newProject.id);
    showToast('项目创建成功，已自动创建群聊！', 'success');
    closeModal('createProjectModal');
    renderCooperate();
}

function showProjectDetail(id) {
    const projects = DB.get('sp_projects', []);
    const p = projects.find(x => x.id === id);
    if (!p) return;
    const users = DB.get('sp_users', []);
    const statusMap = { recruiting: { text:'招募中', cls:'recruiting' }, 'in-progress': { text:'进行中', cls:'in-progress' }, completed: { text:'已完成', cls:'completed' } };
    const st = statusMap[p.status] || statusMap.recruiting;
    const isMember = (p.members || []).some(m => m.user_id === currentUser?.id);
    const isCreator = p.creator_id === currentUser?.id;
    const membersHtml = (p.members || []).map(m => {
        const u = users.find(x => x.id === m.user_id);
        return `<div class="project-member-card" style="cursor:pointer;" onclick="showUserProfile(${m.user_id})" title="查看主页"><div class="avatar">${(u?.real_name || u?.username || '?').charAt(0)}</div><div><div class="name">${u?.real_name || u?.username || '未知'}</div><div class="role">${m.role}</div></div></div>`;
    }).join('');
    document.getElementById('projectDetailTitle').textContent = p.project_name;
    document.getElementById('projectDetailBody').innerHTML = `
        <div class="detail-meta" style="margin-bottom:16px;">
            <span class="project-status ${st.cls}">${st.text}</span>
            ${p.total_budget ? `<span class="detail-meta-item">💰 预算 ¥${p.total_budget}</span>` : ''}
        </div>
        <div class="detail-section"><h4>项目描述</h4><p>${p.project_desc}</p></div>
        <div class="detail-section"><h4>团队成员（${(p.members||[]).length}人）</h4><div class="project-members-list">${membersHtml}</div></div>
        ${p.need_skills?.length ? `<div class="detail-section"><h4>需要技能</h4><div class="detail-tags">${p.need_skills.map(s => `<span class="service-tag">${s}</span>`).join('')}</div></div>` : ''}
        <div class="detail-actions">
            ${isMember ? `<button class="btn-primary" onclick="openGroupChat(${p.id})">💬 进入群聊</button>` : ''}
            ${!isMember && p.status === 'recruiting' && currentUser ? `<button class="btn-primary" onclick="joinProject(${p.id})">申请加入</button>` : ''}
            ${isCreator && p.status === 'recruiting' ? `<button class="btn-ghost" onclick="startProject(${p.id})">开始项目</button>` : ''}
            <button class="btn-ghost" onclick="closeModal('projectDetailModal')">关闭</button>
        </div>`;
    openModal('projectDetailModal');
}

function joinProject(projectId) {
    const projects = DB.get('sp_projects', []);
    const p = projects.find(x => x.id === projectId);
    if (!p) return;
    if ((p.members || []).some(m => m.user_id === currentUser.id)) { showToast('你已经是项目成员', 'error'); return; }
    p.members.push({ user_id: currentUser.id, role: '成员' });
    DB.set('sp_projects', projects);
    showToast('加入成功！', 'success');
    showProjectDetail(projectId);
    renderCooperate();
}

function startProject(projectId) {
    const projects = DB.get('sp_projects', []);
    const p = projects.find(x => x.id === projectId);
    if (!p) return;
    p.status = 'in-progress';
    DB.set('sp_projects', projects);
    showToast('项目已开始！', 'success');
    showProjectDetail(projectId);
    renderCooperate();
}

async function openGroupChat(projectId) {
    closeModal('projectDetailModal');
    const p = DB.get('sp_projects', []).find(x => x.id === projectId);
    if (!p) { showToast('项目不存在', 'error'); return; }
    if (!currentUser) { showLoginModal(); return; }
    switchPage('messages');
    // 项目群聊必须在服务端真实存在（g_<group_id>），找不到同名群就在服务端建一个，
    // 并给其他项目成员发邀请；之前用 'group_<项目id>' 当 key 导致按私聊调接口报错
    await loadGroupData();
    let g = myGroups.find(x => x.name === p.project_name);
    if (!g) {
        try {
            const otherIds = (p.members || []).map(m => m.user_id).filter(id => Number(id) !== Number(currentUser.id));
            const r = await apiFetch('/groups', { method: 'POST', body: JSON.stringify({ name: p.project_name, member_ids: otherIds }) }).then(r => r.json());
            await loadGroupData();
            g = myGroups.find(x => Number(x.group_id) === Number(r.group_id)) || { group_id: r.group_id, name: p.project_name, members: [{ user_id: currentUser.id, role: '群主' }] };
            showToast('已为项目创建群聊', 'success');
        } catch (e) {
            showToast('创建项目群聊失败：' + e.message, 'error');
            return;
        }
    }
    currentChatKey = 'g_' + g.group_id;
    renderMessages();
    renderChatWindow();
}

// ========== 订单 ==========
function switchOrderTab(tab) {
    currentOrderTab = tab;
    document.querySelectorAll('.order-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    renderOrders();
}

function renderOrders() {
    if (!currentUser) {
        document.getElementById('orderList').innerHTML = '';
        document.getElementById('orderEmpty').style.display = 'block';
        document.getElementById('orderEmptyText').textContent = '请先登录查看订单';
        return;
    }
    const orders = DB.get('sp_orders', []);
    const tasks = DB.get('sp_tasks', []);
    const services = DB.get('sp_services', []);
    const users = DB.get('sp_users', []);
    let list = [];

    if (currentOrderTab === 'received') {
        // 我接收的：我是买家的服务订单 + 我是接单者的任务，进行中
        orders.filter(o => o.buyer_id === currentUser.id && (o.order_status === 0 || o.order_status === 1)).forEach(o => {
            const s = services.find(x => x.id === o.service_id);
            const seller = users.find(u => u.id === o.seller_id);
            list.push({ type:'service', id:o.id, title:s?.title || '服务', cover:s?.cover, price:o.order_price, other:seller, status:o.order_status, chatKey:'service_'+s?.id, otherId:o.seller_id, createdAt:o.created_at });
        });
        tasks.filter(t => t.taker_id === currentUser.id && t.status === 1).forEach(t => {
            const publisher = users.find(u => u.id === t.publisher_id);
            list.push({ type:'task', id:t.id, title:t.title, cover:t.cover, price:t.budget, other:publisher, status:'progress', chatKey:'task_'+t.id, otherId:t.publisher_id, createdAt:t.created_at });
        });
    } else if (currentOrderTab === 'published') {
        // 我发布的：我是卖家的服务订单 + 我是发布者的任务，进行中
        orders.filter(o => o.seller_id === currentUser.id && (o.order_status === 0 || o.order_status === 1)).forEach(o => {
            const s = services.find(x => x.id === o.service_id);
            const buyer = users.find(u => u.id === o.buyer_id);
            list.push({ type:'service', id:o.id, title:s?.title || '服务', cover:s?.cover, price:o.order_price, other:buyer, status:o.order_status, chatKey:'service_'+s?.id, otherId:o.buyer_id, createdAt:o.created_at });
        });
        tasks.filter(t => t.publisher_id === currentUser.id && t.status === 1).forEach(t => {
            const taker = users.find(u => u.id === t.taker_id);
            list.push({ type:'task', id:t.id, title:t.title, cover:t.cover, price:t.budget, other:taker, status:'progress', chatKey:'task_'+t.id, otherId:t.taker_id, createdAt:t.created_at });
        });
    } else {
        // 历史订单：所有已完成/已取消
        orders.filter(o => (o.buyer_id === currentUser.id || o.seller_id === currentUser.id) && (o.order_status === 2 || o.order_status === 3)).forEach(o => {
            const s = services.find(x => x.id === o.service_id);
            const other = users.find(u => u.id === (o.buyer_id === currentUser.id ? o.seller_id : o.buyer_id));
            list.push({ type:'service', id:o.id, title:s?.title || '服务', cover:s?.cover, price:o.order_price, other, status:o.order_status, chatKey:'service_'+s?.id, otherId:o.buyer_id === currentUser.id ? o.seller_id : o.buyer_id, createdAt:o.created_at });
        });
        tasks.filter(t => (t.publisher_id === currentUser.id || t.taker_id === currentUser.id) && (t.status === 2 || t.status === 3)).forEach(t => {
            const other = users.find(u => u.id === (t.publisher_id === currentUser.id ? t.taker_id : t.publisher_id));
            list.push({ type:'task', id:t.id, title:t.title, cover:t.cover, price:t.budget, other, status:t.status === 2 ? 'completed' : 'cancelled', chatKey:'task_'+t.id, otherId:t.publisher_id === currentUser.id ? t.taker_id : t.publisher_id, createdAt:t.created_at });
        });
    }

    const statusMap = { 0:{text:'待确认',cls:'pending'}, 1:{text:'进行中',cls:'progress'}, 2:{text:'已完成',cls:'completed'}, 3:{text:'已取消',cls:'cancelled'}, 'progress':{text:'进行中',cls:'progress'}, 'completed':{text:'已完成',cls:'completed'}, 'cancelled':{text:'已取消',cls:'cancelled'} };
    const unread = getUnreadCount();

    document.getElementById('orderList').innerHTML = list.map(item => {
        const st = statusMap[item.status] || statusMap[0];
        const coverHtml = item.cover ? `<img src="${item.cover}" onerror="this.style.display='none'">` : (item.type === 'service' ? '📄' : '📋');
        const chatUnread = unread[item.chatKey] || 0;
        const isInProgress = item.status === 0 || item.status === 1 || item.status === 'progress';
        let actions = '';
        if (item.type === 'service') {
            if (item.status === 0 && item.otherId !== currentUser.id) actions += `<button class="order-action-btn primary" onclick="confirmOrder(${item.id})">确认接单</button>`;
            if (item.status === 1) {
                if (item.otherId === currentUser.id) actions += `<button class="order-action-btn primary" onclick="completeOrder(${item.id})">确认完成</button>`;
                else actions += `<button class="order-action-btn ghost" onclick="completeOrder(${item.id})">标记完成</button>`;
            }
            if (isInProgress) actions += `<button class="order-action-btn danger" onclick="cancelOrder(${item.id})">取消</button>`;
        } else {
            if (item.status === 'progress' && item.otherId === currentUser.id) actions += `<button class="order-action-btn primary" onclick="completeTask(${item.id})">确认完成</button>`;
            if (isInProgress) actions += `<button class="order-action-btn danger" onclick="cancelTask(${item.id})">取消</button>`;
        }
        if (isInProgress) actions += `<button class="order-action-btn ghost order-chat-btn" onclick="openChatFromOrder('${item.chatKey}')">💬 联系${chatUnread ? `<span class="chat-badge">${chatUnread}</span>` : ''}</button>`;
        return `<div class="order-card">
            <div class="order-cover">${coverHtml}</div>
            <div class="order-info">
                <div class="order-header"><div class="order-title">${item.title}<span class="order-type-badge ${item.type}">${item.type === 'service' ? '服务订单' : '需求任务'}</span></div></div>
                <div class="order-meta">${item.type === 'service' ? '对方：' : (item.otherId === currentUser.id ? '接单者：' : '发布者：')}${item.other?.real_name || item.other?.username || '未知'}</div>
                ${item.createdAt ? `<div class="order-meta" style="font-size:12px;color:var(--text-tertiary);">🕐 ${fmtDateTime(item.createdAt)}</div>` : ''}
                <div class="order-price">¥${item.price}</div>
            </div>
            <div class="order-actions"><span class="order-status ${st.cls}">${st.text}</span>${actions}</div>
        </div>`;
    }).join('');
    document.getElementById('orderEmpty').style.display = list.length === 0 ? 'block' : 'none';
    document.getElementById('orderEmptyText').textContent = currentOrderTab === 'history' ? '暂无历史订单' : '暂无进行中的订单';
}

function confirmOrder(orderId) {
    const orders = DB.get('sp_orders', []);
    const o = orders.find(x => x.id === orderId);
    if (o) { o.order_status = 1; DB.set('sp_orders', orders); showToast('已确认接单', 'success'); renderOrders(); }
}
function completeOrder(orderId) {
    const orders = DB.get('sp_orders', []);
    const o = orders.find(x => x.id === orderId);
    if (o) { o.order_status = 2; DB.set('sp_orders', orders); showToast('订单已完成', 'success'); renderOrders(); }
}
function cancelOrder(orderId) {
    const orders = DB.get('sp_orders', []);
    const o = orders.find(x => x.id === orderId);
    if (o) { o.order_status = 3; DB.set('sp_orders', orders); showToast('订单已取消', 'success'); renderOrders(); }
}
function completeTask(taskId) {
    const tasks = DB.get('sp_tasks', []);
    const t = tasks.find(x => x.id === taskId);
    if (t) { t.status = 2; DB.set('sp_tasks', tasks); showToast('任务已完成', 'success'); renderOrders(); }
}
function cancelTask(taskId) {
    const tasks = DB.get('sp_tasks', []);
    const t = tasks.find(x => x.id === taskId);
    if (t) { t.status = 3; DB.set('sp_tasks', tasks); showToast('任务已取消', 'success'); renderOrders(); }
}

function openChatFromOrder(chatKey) {
    currentChatKey = chatKey;
    switchPage('messages');
    renderMessages();
    renderChatWindow();
}

// ========== 消息系统（后端API版） ==========
// 私信数据走后端 Cloudflare Worker + D1 数据库，登录/注册/服务/订单仍用 localStorage。
// 当前仅支持文本消息，无 websocket：新消息靠每10秒轮询拉取。

const API_BASE = "https://azhegezhege.pages.dev/api";

let msgUnreadCache = {};   // 对方userId字符串 -> 未读数（本地缓存，供角标/订单页显示）
let msgPolling = false;    // 轮询锁，防止并发请求堆积

/**
 * 统一请求：自动附带登录 token（Authorization: Bearer xxx）
 * 登录态失效（401）时自动清除会话并弹出登录框
 */
async function apiFetch(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    if (currentUser && currentUser.token) headers['Authorization'] = 'Bearer ' + currentUser.token;
    if (options.body != null) headers['Content-Type'] = 'application/json';
    const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
    if (res.status === 401 && currentUser) {
        logout();
        showLoginModal();
        throw new Error('登录已过期，请重新登录');
    }
    return res;
}

/**
 * 发送私信（文本消息）。发送者由服务端根据 token 判定，客户端无法伪造
 * @param {string|number} receiverId 接收方用户id
 * @param {string} content 消息文本
 */
async function sendPrivateMsg(receiverId, content) {
    const res = await apiFetch(`/send`, {
        method: "POST",
        body: JSON.stringify({ receiver_id: receiverId, content })
    });
    if (!res.ok) throw new Error('服务器返回 HTTP ' + res.status);
    return await res.json();
}

/**
 * 获取和某个用户的聊天历史
 * @param {string} myId 当前登录用户id（仅用于兼容，服务端以 token 为准）
 * @param {string} peerId 对方用户id
 */
async function loadChatHistory(myId, peerId) {
    const res = await apiFetch(`/history?peer_id=${encodeURIComponent(peerId)}`);
    if (!res.ok) throw new Error('服务器返回 HTTP ' + res.status);
    return await res.json();
}

/**
 * 获取当前用户全部会话列表（左侧消息列表，服务端返回对方昵称/头像/最后一条消息）
 * @param {string} myId 当前登录用户id（仅用于兼容）
 */
async function getConversationList(myId) {
    const res = await apiFetch(`/conversations`);
    if (!res.ok) throw new Error('服务器返回 HTTP ' + res.status);
    return await res.json();
}

/**
 * 将对方发给我的消息标记已读
 * @param {string} peerId 对方id
 * @param {string} myId 当前登录id（仅用于兼容）
 */
async function markMsgRead(peerId, myId) {
    await apiFetch(`/read`, {
        method: "POST",
        body: JSON.stringify({ peer_id: peerId })
    });
}

/**
 * 从服务端批量拉取用户公开资料（昵称/头像），并写入本地缓存供展示
 * @param {Array<string|number>} ids 用户id列表
 */
async function fetchUserInfo(ids) {
    const res = await apiFetch(`/users?ids=${ids.map(encodeURIComponent).join(',')}`);
    if (!res.ok) return [];
    const list = await res.json();
    const users = DB.get('sp_users', []);
    list.forEach(u => {
        const i = users.findIndex(x => Number(x.id) === Number(u.id));
        if (i >= 0) Object.assign(users[i], u); else users.push(u);
    });
    DB.set('sp_users', users);
    return list;
}

// ---------- 在线状态心跳：登录状态下每60秒上报一次，对方可见"在线" ----------
setInterval(() => {
    if (currentUser && currentUser.token) {
        apiFetch('/heartbeat', { method: 'POST' }).catch(() => {});
    }
}, 60000);

// ---------- 后端响应归一化（兼容不同字段名，避免字段变动导致页面报错） ----------
function arrFrom(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.messages)) return data.messages;
    if (data && Array.isArray(data.conversations)) return data.conversations;
    if (data && Array.isArray(data.list)) return data.list;
    if (data && Array.isArray(data.result)) return data.result;
    return [];
}

function normTime(ts) {
    if (ts == null) return 0;
    if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

function normMsg(m) {
    let isRead = m.is_read;
    if (isRead == null) isRead = m.read;
    if (isRead == null) isRead = m.status === 'read';
    return {
        id: m.id,
        sender_id: m.sender_id != null ? m.sender_id : (m.from_id != null ? m.from_id : m.sender),
        receiver_id: m.receiver_id != null ? m.receiver_id : m.to_id,
        content: m.content != null ? m.content : (m.text != null ? m.text : (m.message || '')),
        time: normTime(m.created_at != null ? m.created_at : (m.time != null ? m.time : m.timestamp)),
        is_read: !!isRead
    };
}

function normConv(c, myId) {
    let peerId = c.peer_id;
    if (peerId == null) peerId = c.other_id;
    if (peerId == null) peerId = c.other_user_id;
    if (peerId == null && c.user_id != null && Number(c.user_id) !== Number(myId)) peerId = c.user_id;
    if (peerId == null && c.receiver_id != null && Number(c.receiver_id) !== Number(myId)) peerId = c.receiver_id;
    if (peerId == null && c.sender_id != null && Number(c.sender_id) !== Number(myId)) peerId = c.sender_id;
    const name = c.name != null ? c.name : (c.display_name != null ? c.display_name : (c.username != null ? c.username : (c.real_name != null ? c.real_name : null)));
    const lastMsg = c.last_msg != null ? c.last_msg : (c.last_message != null ? c.last_message : (c.last_content != null ? c.last_content : (c.content != null ? c.content : '暂无消息')));
    const lastTime = normTime(c.last_time != null ? c.last_time : (c.updated_at != null ? c.updated_at : (c.last_at != null ? c.last_at : c.time)));
    return {
        peer_id: Number(peerId),
        name,
        avatar: c.avatar != null ? c.avatar : (c.peer_avatar || null),
        online: !!c.online,
        last_msg: lastMsg,
        last_time: lastTime,
        unread: Number(c.unread != null ? c.unread : c.unread_count) || 0
    };
}

// ---------- chatKey(service_/task_) 解析出对方用户id，兼容订单/任务入口 ----------
function peerIdFromChatKey(chatKey) {
    if (chatKey == null || !currentUser) return null;
    if (typeof chatKey === 'number') return chatKey;
    const s = String(chatKey);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (s.startsWith('service_')) {
        const id = parseInt(s.slice(8), 10);
        const o = DB.get('sp_orders', []).find(x => x.service_id === id);
        if (o) return o.buyer_id === currentUser.id ? o.seller_id : o.buyer_id;
        const svc = DB.get('sp_services', []).find(x => x.id === id);
        if (svc) return svc.user_id;
        return null;
    }
    if (s.startsWith('task_')) {
        const id = parseInt(s.slice(5), 10);
        const t = DB.get('sp_tasks', []).find(x => x.id === id);
        if (t) return t.publisher_id === currentUser.id ? t.taker_id : t.publisher_id;
        return null;
    }
    return null; // group_ 群聊后端暂不支持
}

// 会话由后端按收发消息自动建立，无需本地预创建（保留空实现，兼容订单/任务/项目调用）
function ensureChat() {}

// ---------- 渲染左侧会话列表 ----------
async function renderMessages() {
    if (!currentUser) {
        document.getElementById('msgList').innerHTML = '';
        document.getElementById('msgEmpty').style.display = 'flex';
        return;
    }
    let convs = [];
    try {
        convs = arrFrom(await getConversationList(currentUser.id))
            .map(c => normConv(c, currentUser.id))
            .filter(c => c.peer_id != null);
    } catch (e) {
        document.getElementById('msgList').innerHTML = `<div style="padding:16px;color:#FB7185;font-size:13px;">会话加载失败：${e.message}<br>请检查后端 API_BASE 是否可访问</div>`;
        document.getElementById('msgEmpty').style.display = 'none';
        return;
    }
    // 缓存未读数（当前打开的会话不记未读）
    msgUnreadCache = {};
    convs.forEach(c => {
        if (c.unread > 0 && String(c.peer_id) !== String(currentChatKey)) msgUnreadCache[String(c.peer_id)] = c.unread;
    });
    document.getElementById('msgEmpty').style.display = convs.length === 0 ? 'flex' : 'none';
    const users = DB.get('sp_users', []);
    let html = kefuTileHtml() + inviteBannerHtml() + groupTileHtml();
    html += convs.map(c => {
        const u = users.find(x => Number(x.id) === Number(c.peer_id));
        const displayName = c.name || (u ? (u.real_name || u.username) : '用户');
        const avatar = c.avatar || (u && u.avatar) || null;
        const avatarHtml = avatar
            ? `<img src="${avatar}" class="msg-item-avatar" style="object-fit:cover;">`
            : `<div class="msg-item-avatar">${String(displayName).charAt(0)}</div>`;
        const isActive = String(currentChatKey) === String(c.peer_id);
        return `<div class="msg-item ${isActive ? 'active' : ''}" onclick="selectChat('${c.peer_id}')">
            ${avatarHtml}
            <div class="msg-item-info">
                <div class="msg-item-name">${displayName}${c.online ? '<span class="online-dot"></span>' : ''}<span class="msg-item-time">${formatTime(c.last_time)}</span></div>
                <div class="msg-item-preview">${String(c.last_msg).substring(0, 30)}</div>
            </div>
            ${c.unread > 0 ? `<span class="msg-item-badge">${c.unread}</span>` : ''}
        </div>`;
    }).join('');
    document.getElementById('msgList').innerHTML = html;
    updateBadges();
}

// ========== 群聊 + 官方客服（网页版） ==========
let myGroups = [], groupInvites = [], kefuUser = null;

function isGroupChat() { return String(currentChatKey || '').startsWith('g_'); }

async function loadGroupData() {
    try {
        const d = await apiFetch('/groups/mine').then(r => r.json());
        myGroups = d.joined || [];
        groupInvites = d.invites || [];
    } catch (e) {}
    try {
        if (!kefuUser) {
            const u = await apiFetch('/users?username=kefu01').then(r => r.json());
            kefuUser = (u && u[0]) || null;
        }
    } catch (e) {}
}

function kefuTileHtml() {
    if (!kefuUser) return '';
    return `<div class="msg-item" onclick="selectChat('kefu_${kefuUser.id}')">
        <div class="msg-item-avatar" style="background:linear-gradient(135deg,#7C3AED,#00C2FF);">🎧</div>
        <div class="msg-item-info">
            <div class="msg-item-name">官方客服<span class="online-dot"></span></div>
            <div class="msg-item-preview">交易分歧、账号问题随时留言</div>
        </div>
    </div>`;
}

function inviteBannerHtml() {
    if (!groupInvites.length) return '';
    return '<div style="margin:8px 10px;padding:10px 12px;background:rgba(139,92,246,0.15);border-radius:12px;">' +
        groupInvites.map(inv =>
            '<div style="display:flex;align-items:center;gap:8px;font-size:12px;">' +
            '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + inv.inviter_name + ' 邀请你加入「' + inv.name + '」</span>' +
            '<button onclick="handleGroupInvite(' + inv.invite_id + ',false)" style="font-size:11px;padding:4px 8px;border:none;background:none;color:#8D87A3;cursor:pointer;">拒绝</button>' +
            '<button onclick="handleGroupInvite(' + inv.invite_id + ',true)" style="font-size:11px;padding:4px 10px;border:none;background:#8B5CF6;color:#fff;border-radius:12px;cursor:pointer;">同意</button>' +
            '</div>').join('') +
        '</div>';
}

function groupTileHtml() {
    if (!myGroups.length) return '';
    let h = '<div style="padding:10px 16px 2px;font-size:12px;color:#8D87A3;">我的群聊</div>';
    h += '<div style="display:flex;gap:12px;overflow-x:auto;padding:4px 16px 8px;">';
    h += myGroups.map(g =>
        '<div style="width:64px;text-align:center;cursor:pointer;position:relative;flex-shrink:0;" onclick="selectChat(\'g_' + g.group_id + '\')">' +
        '<div style="width:48px;height:48px;margin:0 auto;border-radius:50%;background:rgba(139,92,246,0.15);display:flex;align-items:center;justify-content:center;font-size:22px;">👥</div>' +
        ((g.unread || 0) > 0 ? '<span style="position:absolute;top:-2px;right:6px;min-width:16px;height:16px;border-radius:8px;background:#FB7185;color:#fff;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;padding:0 4px;">' + g.unread + '</span>' : '') +
        '<div style="font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + g.name + '</div>' +
        '</div>').join('');
    h += '</div><div style="height:1px;background:rgba(255,255,255,0.08);margin:4px 0;"></div>';
    return h;
}

async function handleGroupInvite(inviteId, accept) {
    try {
        await apiFetch('/groups/invites/handle', { method: 'POST', body: JSON.stringify({ invite_id: inviteId, accept: accept }) });
        await loadGroupData();
        renderMessages();
        showToast(accept ? '已加入群聊' : '已拒绝', 'success');
    } catch (e) {
        showToast('操作失败：' + e.message, 'error');
    }
}

// 发起群聊弹窗：填群名 + 勾选成员
async function showCreateGroup() {
    if (!currentUser) { showLoginModal(); return; }
    let users = [];
    try { users = await apiFetch('/users').then(r => r.json()); } catch (e) {}
    users = (users || []).filter(u => Number(u.id) !== Number(currentUser.id));
    const selected = new Set();
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'groupCreateModal';
    modal.innerHTML = '<div class="modal-content modal-sm">' +
        '<div class="modal-header"><h3>发起群聊</h3><span class="modal-close" onclick="this.closest(\'.modal\').remove()">×</span></div>' +
        '<div class="modal-body">' +
        '<div class="form-group"><label>群名称</label><input type="text" id="gName" placeholder="给群起个名字"></div>' +
        '<div class="form-group"><label>选择成员（对方同意后进群）</label>' +
        '<div id="gMembers" style="max-height:260px;overflow-y:auto;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:6px;">' +
        (users.length ? users.map(u =>
            '<label style="display:flex;align-items:center;gap:8px;padding:7px 8px;cursor:pointer;border-radius:8px;" onmouseover="this.style.background=\'rgba(139,92,246,0.12)\'" onmouseout="this.style.background=\'\'">' +
            '<input type="checkbox" data-uid="' + u.id + '" onchange="this.checked?1:1">' +
            '<span style="font-size:13px;">' + (u.real_name || u.username) + '</span>' +
            '<span style="font-size:11px;color:#8D87A3;">@' + u.username + '</span>' +
            '</label>').join('') : '<div style="padding:16px;text-align:center;color:#8D87A3;font-size:12px;">暂无其他用户</div>') +
        '</div></div>' +
        '<button class="btn-primary btn-block" onclick="submitCreateGroup()">创建并发出邀请</button>' +
        '</div></div>';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
            const uid = Number(cb.dataset.uid);
            if (cb.checked) selected.add(uid); else selected.delete(uid);
        });
    });
    document.body.appendChild(modal);
    window._groupSelected = selected;
}

async function submitCreateGroup() {
    const name = document.getElementById('gName').value.trim();
    const ids = [...(window._groupSelected || [])];
    if (!name) { showToast('请填写群名称', 'error'); return; }
    if (!ids.length) { showToast('请至少选择一位成员', 'error'); return; }
    try {
        await apiFetch('/groups', { method: 'POST', body: JSON.stringify({ name: name, member_ids: ids }) });
        const m = document.getElementById('groupCreateModal');
        if (m) m.remove();
        showToast('群聊已创建，等待成员同意加入', 'success');
        await loadGroupData();
        renderMessages();
    } catch (e) {
        showToast('创建失败：' + e.message, 'error');
    }
}

// ========== 发现用户（仅展示开启"允许别人发现我"的用户） ==========
function fmtDateTime(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts));
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// 从任意入口发起私聊（项目成员、发现用户等）
function openPrivateChat(uid) {
    if (!currentUser) { showLoginModal(); return; }
    currentChatKey = String(uid);
    switchPage('messages');
    renderMessages();
    renderChatWindow();
}

// ========== 个人主页（资料 + 作品 + 聊一聊） ==========
async function showUserProfile(uid) {
    let u = null, works = [];
    try {
        const list = await fetchUserInfo([uid]);
        u = (list && list[0]) || DB.get('sp_users', []).find(x => Number(x.id) === Number(uid)) || null;
    } catch (e) {}
    try { works = await apiFetch('/works?user_id=' + uid).then(r => r.json()); } catch (e) {}
    if (!u) { showToast('用户不存在', 'error'); return; }
    const name = u.real_name || u.username;
    const avatarHtml = u.avatar
        ? `<img src="${u.avatar}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid rgba(139,92,246,0.5);">`
        : `<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#8B5CF6,#A78BFA);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;">${String(name).charAt(0)}</div>`;
    const tags = String(u.skill_tag || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const worksHtml = (works || []).map(w => {
        const src = String(w).startsWith('data:') ? w : 'data:image/jpeg;base64,' + w;
        return `<div style="border-radius:12px;overflow:hidden;background:var(--bg-secondary);aspect-ratio:1;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;font-size:28px;\\'>🎬</div>'"></div>`;
    }).join('');
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'userProfileModal';
    modal.innerHTML = '<div class="modal-content modal-sm">' +
        '<div class="modal-header"><h3>个人主页</h3><span class="modal-close" onclick="this.closest(\'.modal\').remove()">×</span></div>' +
        '<div class="modal-body">' +
        '<div style="display:flex;align-items:center;gap:14px;">' + avatarHtml +
        '<div style="flex:1;min-width:0;"><div style="font-size:17px;font-weight:700;">' + name + (u.online ? '<span class="online-dot"></span>' : '') + '</div>' +
        '<div style="font-size:12px;color:#8D87A3;">@' + (u.username || '') + ' · ' + (Number(u.user_type) === 1 ? '技能提供者' : '普通用户') + '</div>' +
        (u.bio ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' + u.bio + '</div>' : '') + '</div></div>' +
        (tags.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;">' + tags.map(t => '<span class="service-tag">' + t + '</span>').join('') + '</div>' : '') +
        '<div style="font-size:13px;font-weight:600;margin:16px 0 8px;">作品展示（' + (works || []).length + '）</div>' +
        ((works || []).length ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:300px;overflow-y:auto;">' + worksHtml + '</div>'
            : '<div style="color:#8D87A3;font-size:12px;padding:8px 0 4px;">暂无作品</div>') +
        (currentUser && Number(currentUser.id) !== Number(uid) ? '<button class="btn-primary btn-block" onclick="document.getElementById(\'userProfileModal\').remove();openPrivateChat(' + uid + ')">💬 发消息</button>' : '') +
        '</div></div>';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

async function showDiscoverUsers() {
    if (!currentUser) { showLoginModal(); return; }
    let users = [];
    try { users = await apiFetch('/users/discover').then(r => r.json()); } catch (e) {
        showToast('加载失败：' + e.message, 'error'); return;
    }
    users = users || [];
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'discoverModal';
    modal.innerHTML = '<div class="modal-content modal-sm">' +
        '<div class="modal-header"><h3>发现同学（' + users.length + '人）</h3><span class="modal-close" onclick="this.closest(\'.modal\').remove()">×</span></div>' +
        '<div class="modal-body">' +
        '<div style="max-height:360px;overflow-y:auto;">' +
        (users.length ? users.map(u => {
            const avatarHtml = u.avatar
                ? `<img src="${u.avatar}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`
                : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#8B5CF6,#A78BFA);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;">${String(u.real_name || u.username).charAt(0)}</div>`;
            return '<div style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;" onclick="document.getElementById(\'discoverModal\').remove();showUserProfile(' + u.id + ')" title="查看主页">' +
                avatarHtml +
                '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:14px;font-weight:600;">' + (u.real_name || u.username) + (u.online ? '<span class="online-dot"></span>' : '') + ' <span style="font-size:11px;color:#8D87A3;font-weight:400;">@' + u.username + '</span></div>' +
                '<div style="font-size:11px;color:#8D87A3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (u.skill_tag ? '🏷 ' + u.skill_tag : (u.bio || '暂无标签')) + '</div>' +
                '</div></div>' +
                '<button class="btn-primary btn-sm" onclick="document.getElementById(\'discoverModal\').remove();openPrivateChat(' + u.id + ')">聊一聊</button>' +
                '</div>';
        }).join('') : '<div style="padding:24px;text-align:center;color:#8D87A3;font-size:13px;">暂时没有可发现的用户<br><span style="font-size:11px;">在设置里开启「允许别人发现我」后，会出现在这里</span></div>') +
        '</div></div></div>';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

// ========== 设置：隐私开关（允许别人发现我） ==========
function showWebSettings() {
    if (!currentUser) { showLoginModal(); return; }
    const on = currentUser.discoverable !== 0;
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'webSettingsModal';
    modal.innerHTML = '<div class="modal-content modal-sm">' +
        '<div class="modal-header"><h3>设置</h3><span class="modal-close" onclick="this.closest(\'.modal\').remove()">×</span></div>' +
        '<div class="modal-body">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;">' +
        '<div><div style="font-size:14px;font-weight:600;">允许别人发现我</div><div style="font-size:12px;color:#8D87A3;">关闭后，你不会出现在「发现同学」列表中</div></div>' +
        '<label style="position:relative;width:44px;height:24px;cursor:pointer;"><input type="checkbox" id="discoverSwitch" ' + (on ? 'checked' : '') + ' style="display:none;" onchange="this.nextElementSibling.style.background=this.checked?\'#8B5CF6\':\'rgba(255,255,255,0.15)\';this.nextElementSibling.firstElementChild.style.transform=this.checked?\'translateX(20px)\':\'translateX(0)\'"><span style="position:absolute;inset:0;border-radius:12px;background:' + (on ? '#8B5CF6' : 'rgba(255,255,255,0.15)') + ';transition:background 0.2s;"><span style="position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform 0.2s;transform:translateX(' + (on ? '20px' : '0') + ');"></span></span></label>' +
        '</div>' +
        '<button class="btn-primary btn-block" onclick="saveWebSettings()">保存</button>' +
        '</div></div>';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

async function saveWebSettings() {
    const sw = document.getElementById('discoverSwitch');
    try {
        await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ discoverable: sw.checked ? 1 : 0 }) });
        currentUser.discoverable = sw.checked ? 1 : 0;
        DB.set('sp_current_user', currentUser);
        const m = document.getElementById('webSettingsModal'); if (m) m.remove();
        showToast('设置已保存', 'success');
    } catch (e) {
        showToast('保存失败：' + e.message, 'error');
    }
}

// 群聊窗口渲染（复用聊天窗口 DOM）
async function renderGroupChatWindow() {
    const gid = String(currentChatKey).slice(2);
    let msgs = [];
    try {
        msgs = arrFrom(await apiFetch('/group/history?group_id=' + gid).then(r => r.json()));
    } catch (e) {
        document.getElementById('msgChatBody').innerHTML = '<div style="padding:16px;color:#FB7185;font-size:13px;">群消息加载失败：' + e.message + '</div>';
        return;
    }
    document.getElementById('msgChatHeader').innerHTML =
        '<div class="msg-chat-header-avatar" id="groupAvatarBtn" title="查看群成员" onclick="showGroupInfoWeb()" style="background:rgba(139,92,246,0.18);color:#C4B5FD;display:flex;align-items:center;justify-content:center;cursor:pointer;">👥</div>' +
        '<div class="msg-chat-header-info" onclick="showGroupInfoWeb()" style="cursor:pointer;"><div class="msg-chat-header-name">' + (myGroups.find(g => String(g.group_id) === gid) || { name: '群聊' }).name + '</div>' +
        '<div class="msg-chat-header-sub">' + ((myGroups.find(g => String(g.group_id) === gid) || {}).member_count || '') + ' 个成员 · 点击查看</div></div>';
    const body = document.getElementById('msgChatBody');
    const newBody = msgs.length ? msgs.map(m => {
        const isSelf = Number(m.sender_id) === Number(currentUser.id);
        return '<div style="font-size:10px;color:#8D87A3;margin:' + (isSelf ? '4px 8px 0 auto;' : '4px 0 0 8px;') + 'max-width:70%;text-align:' + (isSelf ? 'right' : 'left') + ';">' + (isSelf ? '我' : (m.sender_name || '成员')) + '</div>' +
            '<div class="msg-row ' + (isSelf ? 'self' : 'other') + '">' +
            '<div class="msg-bubble ' + (isSelf ? 'self' : 'other') + '">' + m.content + '<div class="msg-time">' + formatTime(m.create_time) + '</div></div>' +
            '<button class="msg-del" onclick="deleteWebGroupMsg(' + gid + ', ' + m.id + ')">删除</button>' +
            '</div>';
    }).join('') : '<div style="padding:20px;text-align:center;color:#8D87A3;font-size:13px;">群聊还没有消息，发第一条吧～</div>';
    if (body.innerHTML !== newBody) {
        body.innerHTML = newBody;
        body.scrollTop = body.scrollHeight;
    }
}

// 删除私聊消息（云端同步）
async function deleteWebMsg(id) {
    if (!confirm('确定删除这条消息吗？双方都不会再看到。')) return;
    try {
        await apiFetch('/messages/delete', { method: 'POST', body: JSON.stringify({ ids: [id] }) });
        await renderChatWindow();
        showToast('已删除', 'success');
    } catch (e) {
        showToast('删除失败：' + e.message, 'error');
    }
}

// 删除群消息（云端同步）
async function deleteWebGroupMsg(gid, id) {
    if (!confirm('确定删除这条群消息吗？')) return;
    try {
        await apiFetch('/group/messages/delete', { method: 'POST', body: JSON.stringify({ group_id: gid, ids: [id] }) });
        await renderGroupChatWindow();
        showToast('已删除', 'success');
    } catch (e) {
        showToast('删除失败：' + e.message, 'error');
    }
}

// 群聊发送
async function sendGroupMessage() {
    const input = document.getElementById('msgInput');
    const content = input.value.trim();
    if (!content) return;
    const gid = String(currentChatKey).slice(2);
    try {
        await apiFetch('/group/send', { method: 'POST', body: JSON.stringify({ group_id: Number(gid), content: content }) });
        input.value = '';
        await renderGroupChatWindow();
    } catch (e) {
        showToast('发送失败：' + e.message, 'error');
    }
}

// ========== 群信息：点击群头像查看成员 / 群主踢人 / 成员拉人 / 退群 ==========
function currentGroupInfo() {
    const gid = String(currentChatKey || '').slice(2);
    return { gid: gid, g: myGroups.find(g => String(g.group_id) === gid) || null };
}

async function showGroupInfoWeb() {
    const { gid, g } = currentGroupInfo();
    if (!g) { showToast('群信息加载失败', 'error'); return; }
    const members = g.members || [];
    const isOwner = members.some(m => Number(m.user_id) === Number(currentUser.id) && m.role === '群主');
    let nameMap = {};
    try {
        const list = await fetchUserInfo(members.map(m => m.user_id));
        (list || []).forEach(u => { nameMap[u.id] = u; });
    } catch (e) {}
    const rows = members.map(m => {
        const u = nameMap[m.user_id] || {};
        const name = u.real_name || u.username || ('用户' + m.user_id);
        const avatarHtml = u.avatar
            ? `<img src="${u.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`
            : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#8B5CF6,#A78BFA);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;">${String(name).charAt(0)}</div>`;
        const isSelf = Number(m.user_id) === Number(currentUser.id);
        const kickBtn = (isOwner && !isSelf)
            ? `<button onclick="kickGroupMember(${gid}, ${m.user_id})" style="font-size:11px;padding:4px 10px;border:none;border-radius:12px;background:rgba(251,113,133,0.15);color:#FB7185;cursor:pointer;">移出</button>`
            : '';
        const tag = m.role === '群主' ? '<span style="font-size:10px;color:#F0C97E;border:1px solid rgba(240,201,126,0.4);border-radius:8px;padding:1px 6px;margin-left:6px;">群主</span>'
            : (isSelf ? '<span style="font-size:10px;color:#8D87A3;margin-left:6px;">我</span>' : '');
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid rgba(255,255,255,0.06);">${avatarHtml}<div style="flex:1;font-size:13px;">${name}${tag}<div style="font-size:11px;color:#8D87A3;">@${u.username || ''}</div></div>${kickBtn}</div>`;
    }).join('');
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'groupInfoModal';
    modal.innerHTML = '<div class="modal-content modal-sm">' +
        '<div class="modal-header"><h3>群信息（' + members.length + '人）</h3><span class="modal-close" onclick="this.closest(\'.modal\').remove()">×</span></div>' +
        '<div class="modal-body">' +
        '<div style="max-height:320px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:6px 10px;">' + (rows || '<div style="padding:16px;text-align:center;color:#8D87A3;font-size:12px;">暂无成员</div>') + '</div>' +
        '<div style="display:flex;gap:10px;margin-top:16px;">' +
        '<button class="btn-primary" style="flex:1;" onclick="showInvitePicker()">＋ 邀请成员</button>' +
        (isOwner ? '' : `<button class="btn-ghost" style="flex:1;color:#FB7185;" onclick="quitGroupWeb(${gid})">退出群聊</button>`) +
        '</div></div></div>';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

// 群主移除成员
async function kickGroupMember(gid, uid) {
    if (!confirm('确定将该成员移出群聊吗？')) return;
    try {
        await apiFetch('/groups/kick', { method: 'POST', body: JSON.stringify({ group_id: Number(gid), user_id: Number(uid) }) });
        showToast('已移出群聊', 'success');
        const m = document.getElementById('groupInfoModal'); if (m) m.remove();
        await loadGroupData();
        renderMessages();
        if (isGroupChat()) await renderGroupChatWindow();
    } catch (e) {
        showToast('移出失败：' + e.message, 'error');
    }
}

// 成员退出群聊
async function quitGroupWeb(gid) {
    if (!confirm('确定退出该群聊吗？')) return;
    try {
        await apiFetch('/groups/quit', { method: 'POST', body: JSON.stringify({ group_id: Number(gid) }) });
        showToast('已退出群聊', 'success');
        const m = document.getElementById('groupInfoModal'); if (m) m.remove();
        currentChatKey = null;
        await loadGroupData();
        renderMessages();
        renderChatWindow();
    } catch (e) {
        showToast('退出失败：' + e.message, 'error');
    }
}

// 拉人弹窗：勾选站内用户（自动排除已是成员的人）
async function showInvitePicker() {
    const { gid, g } = currentGroupInfo();
    if (!g) return;
    let users = [];
    try { users = await apiFetch('/users').then(r => r.json()); } catch (e) {}
    const existIds = new Set((g.members || []).map(m => Number(m.user_id)));
    users = (users || []).filter(u => !existIds.has(Number(u.id)));
    const selected = new Set();
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'groupInviteModal';
    modal.innerHTML = '<div class="modal-content modal-sm">' +
        '<div class="modal-header"><h3>邀请成员进「' + g.name + '」</h3><span class="modal-close" onclick="this.closest(\'.modal\').remove()">×</span></div>' +
        '<div class="modal-body">' +
        '<div style="max-height:280px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:6px;">' +
        (users.length ? users.map(u =>
            '<label style="display:flex;align-items:center;gap:8px;padding:7px 8px;cursor:pointer;border-radius:8px;" onmouseover="this.style.background=\'rgba(139,92,246,0.12)\'" onmouseout="this.style.background=\'\'">' +
            '<input type="checkbox" data-uid="' + u.id + '">' +
            '<span style="font-size:13px;">' + (u.real_name || u.username) + '</span>' +
            '<span style="font-size:11px;color:#8D87A3;">@' + u.username + '</span>' +
            '</label>').join('') : '<div style="padding:16px;text-align:center;color:#8D87A3;font-size:12px;">没有可邀请的用户</div>') +
        '</div>' +
        '<button class="btn-primary btn-block" onclick="submitGroupInvite()">发出邀请（对方同意后进群）</button>' +
        '</div></div>';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
            const uid = Number(cb.dataset.uid);
            if (cb.checked) selected.add(uid); else selected.delete(uid);
        });
    });
    document.body.appendChild(modal);
    window._groupInviteSelected = selected;
    window._groupInviteGid = gid;
}

async function submitGroupInvite() {
    const ids = [...(window._groupInviteSelected || [])];
    const gid = window._groupInviteGid;
    if (!ids.length) { showToast('请至少选择一位用户', 'error'); return; }
    try {
        await apiFetch('/groups/invite', { method: 'POST', body: JSON.stringify({ group_id: Number(gid), member_ids: ids }) });
        const m = document.getElementById('groupInviteModal'); if (m) m.remove();
        showToast('邀请已发出', 'success');
    } catch (e) {
        showToast('邀请失败：' + e.message, 'error');
    }
}

function selectChat(chatKey) {
    currentChatKey = chatKey;
    renderMessages();
    renderChatWindow();
}

// ---------- 渲染右侧聊天窗口 ----------
async function renderChatWindow() {
    if (!currentChatKey) {
        document.getElementById('msgChatPlaceholder').style.display = 'flex';
        document.getElementById('msgChatWindow').style.display = 'none';
        return;
    }
    document.getElementById('msgChatPlaceholder').style.display = 'none';
    document.getElementById('msgChatWindow').style.display = 'flex';

    if (isGroupChat()) { await renderGroupChatWindow(); return; }

    const peerId = currentChatKey;
    const users = DB.get('sp_users', []);
    // 始终以服务端资料为准（不同设备的本地缓存可能互相污染），失败时才退回本地缓存
    let other = users.find(u => Number(u.id) === Number(peerId));
    try {
        const list = await fetchUserInfo([peerId]);
        if (list && list[0]) other = list[0];
    } catch (e) { /* 离线时用本地缓存 */ }
    const displayName = other ? (other.real_name || other.username) : '用户';
    const avatarHtml = other && other.avatar
        ? `<img src="${other.avatar}" class="msg-chat-header-avatar" style="object-fit:cover;cursor:pointer;" onclick="showUserProfile('${peerId}')" title="查看主页">`
        : `<div class="msg-chat-header-avatar" style="cursor:pointer;" onclick="showUserProfile('${peerId}')" title="查看主页">${String(displayName).charAt(0)}</div>`;
    document.getElementById('msgChatHeader').innerHTML = `${avatarHtml}<div class="msg-chat-header-info"><div class="msg-chat-header-name">${displayName}${other && other.online ? '<span class="chat-online-tag">● 在线</span>' : ''}</div></div>`;

    let msgs = [];
    try {
        msgs = arrFrom(await loadChatHistory(currentUser.id, peerId)).map(normMsg);
    } catch (e) {
        document.getElementById('msgChatBody').innerHTML = `<div style="padding:16px;color:#FB7185;font-size:13px;">消息加载失败：${e.message}</div>`;
        return;
    }
    const body = document.getElementById('msgChatBody');
    let lastSelfId = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (Number(msgs[i].sender_id) === Number(currentUser.id)) { lastSelfId = msgs[i].id; break; }
    }
    const newBody = msgs.length
        ? msgs.map(m => {
            const isSelf = Number(m.sender_id) === Number(currentUser.id);
            const isLastSelf = isSelf && m.id === lastSelfId;
            return `<div class="msg-row ${isSelf ? 'self' : 'other'}">` +
                `<div class="msg-bubble ${isSelf ? 'self' : 'other'}">${m.content}<div class="msg-time">${formatTime(m.time)}</div></div>` +
                `<button class="msg-del" onclick="deleteWebMsg(${m.id})">删除</button>` +
                `</div>` +
                (isSelf && isLastSelf ? `<div class="msg-read ${m.is_read ? 'read' : ''}">${m.is_read ? '已读' : '未读'}</div>` : '');
        }).join('')
        : '<div style="padding:20px;text-align:center;color:#8D87A3;font-size:13px;">还没有消息，发送第一条吧～</div>';
    // 内容没变化时不重绘，避免轮询时滚动条跳动
    if (body.innerHTML !== newBody) {
        body.innerHTML = newBody;
        body.scrollTop = body.scrollHeight;
    }

    // 标记已读并清除本地未读缓存
    markMsgRead(peerId, currentUser.id).catch(() => {});
    if (msgUnreadCache[String(peerId)]) {
        msgUnreadCache[String(peerId)] = 0;
        updateBadges();
        renderMessages();
    }
}

// ---------- 未读数（按 chatKey 返回，兼容订单页联系按钮与导航角标） ----------
function getUnreadCount() {
    if (!currentUser) return {};
    const count = {};
    const covered = new Set();
    const orders = DB.get('sp_orders', []);
    orders.filter(o => o.buyer_id === currentUser.id || o.seller_id === currentUser.id).forEach(o => {
        const peer = o.buyer_id === currentUser.id ? o.seller_id : o.buyer_id;
        covered.add(String(peer));
        const u = msgUnreadCache[String(peer)] || 0;
        if (u > 0) count['service_' + o.service_id] = u;
    });
    const tasks = DB.get('sp_tasks', []);
    tasks.filter(t => t.publisher_id === currentUser.id || t.taker_id === currentUser.id).forEach(t => {
        const peer = t.publisher_id === currentUser.id ? t.taker_id : t.publisher_id;
        covered.add(String(peer));
        const u = msgUnreadCache[String(peer)] || 0;
        if (u > 0) count['task_' + t.id] = u;
    });
    // 未关联订单/任务的独立会话，计入总角标
    Object.keys(msgUnreadCache).forEach(peer => {
        if (!covered.has(peer) && msgUnreadCache[peer] > 0) count['peer_' + peer] = msgUnreadCache[peer];
    });
    return count;
}

// ---------- 发送消息 ----------
async function sendChatMessage() {
    if (!currentUser) { showLoginModal(); return; }
    const input = document.getElementById('msgInput');
    const content = input.value.trim();
    if (!content || !currentChatKey) return;
    if (isGroupChat()) { await sendGroupMessage(); return; }
    try {
        await sendPrivateMsg(currentChatKey, content);
        input.value = '';
        await renderChatWindow();
        renderMessages();
    } catch (e) {
        showToast('发送失败：' + e.message, 'error');
    }
}

function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
}

// 后端暂不支持图片/文件消息
function sendMessageFile() {
    if (!currentUser) { showLoginModal(); return; }
    showToast('当前版本仅支持文本消息，图片/文件发送暂未支持', 'error');
}

function openChatWithUser(userId, chatKey) {
    if (!currentUser) { showLoginModal(); return; }
    currentChatKey = String(userId);
    switchPage('messages');
    renderMessages();
    renderChatWindow();
}

// ========== 发起新聊天：按注册账号查找用户（跨设备互通入口） ==========
function showNewChatModal() {
    if (!currentUser) { showLoginModal(); return; }
    openModal('newChatModal');
    setTimeout(() => { const inp = document.getElementById('newChatUsername'); if (inp) inp.focus(); }, 60);
}

async function doStartNewChat(e) {
    e.preventDefault();
    if (!currentUser) { showLoginModal(); return; }
    const name = document.getElementById('newChatUsername').value.trim();
    if (!name) return;
    try {
        const res = await apiFetch('/users?username=' + encodeURIComponent(name));
        const list = await res.json();
        if (!Array.isArray(list) || !list.length) { showToast('未找到账号「' + name + '」', 'error'); return; }
        const u = list[0];
        if (Number(u.id) === Number(currentUser.id)) { showToast('这是你自己的账号', 'error'); return; }
        // 预取对方资料写入本地缓存，聊天窗口直接显示昵称
        fetchUserInfo([u.id]).catch(() => {});
        closeModal('newChatModal');
        openChatWithUser(u.id, String(u.id));
        showToast('已找到「' + (u.real_name || u.username) + '」，发送第一条消息吧', 'success');
    } catch (err) {
        showToast('查找用户失败：' + err.message, 'error');
    }
}

function openChatFromOrder(chatKey) {
    if (!currentUser) { showLoginModal(); return; }
    const peer = peerIdFromChatKey(chatKey);
    if (peer == null) { showToast('无法定位聊天对象', 'error'); return; }
    currentChatKey = String(peer);
    switchPage('messages');
    renderMessages();
    renderChatWindow();
}

// ---------- 无 websocket：在消息页时每10秒轮询拉取新消息 ----------
setInterval(async () => {
    if (!currentUser || currentPage !== 'messages' || msgPolling) return;
    msgPolling = true;
    try {
        await Promise.all([renderMessages(), currentChatKey ? renderChatWindow() : Promise.resolve()]);
    } catch (e) { /* 轮询失败静默 */ }
    msgPolling = false;
}, 10000);

// ========== 通知系统 ==========
function addNotification(userId, type, message) {
    const notifs = DB.get('sp_notifications', []);
    notifs.push({ id: Date.now(), user_id: userId, type, message, is_read: false, created_at: Date.now() });
    DB.set('sp_notifications', notifs);
}

function clearOrderNotifications() {
    if (!currentUser) return;
    const notifs = DB.get('sp_notifications', []);
    notifs.forEach(n => { if (n.user_id === currentUser.id) n.is_read = true; });
    DB.set('sp_notifications', notifs);
    updateBadges();
}

function updateBadges() {
    if (!currentUser) {
        document.getElementById('navOrderBadge').style.display = 'none';
        document.getElementById('navMsgBadge').style.display = 'none';
        return;
    }
    // 订单通知
    const notifs = DB.get('sp_notifications', []);
    const orderUnread = notifs.filter(n => n.user_id === currentUser.id && !n.is_read).length;
    const orderBadge = document.getElementById('navOrderBadge');
    if (orderUnread > 0) { orderBadge.textContent = orderUnread; orderBadge.style.display = 'flex'; }
    else orderBadge.style.display = 'none';
    // 消息未读（私聊 + 群聊）
    const groupUnread = (typeof myGroups !== 'undefined' ? myGroups : []).reduce((a, g) => a + (g.unread || 0), 0);
    const msgUnread = Object.values(getUnreadCount()).reduce((a,b) => a+b, 0) + groupUnread;
    const msgBadge = document.getElementById('navMsgBadge');
    if (msgUnread > 0) { msgBadge.textContent = msgUnread; msgBadge.style.display = 'flex'; }
    else msgBadge.style.display = 'none';
}

// ========== 发布服务 ==========
function updateSubCategoryOptions(type) {
    const catSelect = document.getElementById(type === 'service' ? 'serviceType' : 'taskType');
    const subSelect = document.getElementById(type === 'service' ? 'serviceSubCategory' : 'taskSubCategory');
    const cat = Object.values(CATEGORIES).find(c => c.name === catSelect.value);
    if (cat && cat.subs.length > 0) {
        subSelect.innerHTML = '<option value="">请选择具体类型</option>' + cat.subs.map(s => `<option value="${s.name}">${s.icon} ${s.name}</option>`).join('');
    } else {
        subSelect.innerHTML = '<option value="">无</option>';
    }
}

function submitService(e) {
    e.preventDefault();
    if (!currentUser) { showLoginModal(); return; }
    const services = DB.get('sp_services', []);
    const newService = {
        id: Date.now(),
        user_id: currentUser.id,
        title: document.getElementById('serviceTitle').value,
        service_desc: document.getElementById('serviceDesc').value,
        price: parseFloat(document.getElementById('servicePrice').value),
        service_type: document.getElementById('serviceType').value,
        sub_category: document.getElementById('serviceSubCategory').value,
        tags: document.getElementById('serviceTag').value.split(',').map(t => t.trim()).filter(Boolean),
        cover: uploadState.serviceCover || '',
        sample: uploadState.serviceSamples,
        status: 1,
        created_at: Date.now()
    };
    services.push(newService);
    DB.set('sp_services', services);
    showToast('服务发布成功！', 'success');
    resetServiceUpload();
    document.getElementById('publishForm').reset();
    switchPage('market');
}

function resetServiceUpload() {
    uploadState.serviceCover = null;
    uploadState.serviceSamples = [];
    document.getElementById('serviceCoverPreview').innerHTML = '<span class="upload-icon">🖼️</span><span class="upload-text">点击选择封面图片</span>';
    document.getElementById('serviceSampleList').innerHTML = '';
}

// ========== 发布任务 ==========
function submitTask(e) {
    e.preventDefault();
    if (!currentUser) { showLoginModal(); return; }
    const tasks = DB.get('sp_tasks', []);
    const newTask = {
        id: Date.now(),
        title: document.getElementById('taskTitle').value,
        budget: parseFloat(document.getElementById('taskBudget').value),
        task_type: document.getElementById('taskType').value,
        sub_category: document.getElementById('taskSubCategory').value,
        deadline: document.getElementById('taskDeadline').value,
        desc: document.getElementById('taskDesc').value,
        publisher_id: currentUser.id,
        taker_id: null,
        status: 0,
        cover: uploadState.taskFiles.length > 0 && uploadState.taskFiles[0].type?.startsWith('image/') ? uploadState.taskFiles[0].data : 'images/task-clip.jpg',
        attachments: uploadState.taskFiles,
        created_at: Date.now()
    };
    tasks.push(newTask);
    DB.set('sp_tasks', tasks);
    showToast('任务发布成功！', 'success');
    resetTaskUpload();
    document.getElementById('publishTaskForm').reset();
    switchPage('home');
}

function resetTaskUpload() {
    uploadState.taskFiles = [];
    document.getElementById('taskFilePreview').innerHTML = '<span class="upload-icon">📎</span><span class="upload-text">点击上传参考文件（图片/视频/文档，可多选）</span>';
    document.getElementById('taskSampleList').innerHTML = '';
}

// ========== 文件上传处理 ==========
// 【可替换图片】封面图上传：选择后自动转base64存储，上线后改为上传到云存储
function handleCoverUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('图片不能超过2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = function(ev) {
        const dataUrl = ev.target.result;
        if (type === 'service') {
            uploadState.serviceCover = dataUrl;
            document.getElementById('serviceCoverPreview').innerHTML = `<img src="${dataUrl}" style="max-width:200px;max-height:140px;border-radius:8px;object-fit:cover;">`;
        }
    };
    reader.readAsDataURL(file);
}

// 【可替换图片】作品样例/任务附件多文件上传，支持图片/视频/音频/文档
function handleSampleUpload(e, type) {
    const files = e.target.files;
    if (!files || !files.length) return;
    Array.from(files).forEach(file => {
        if (file.size > 5 * 1024 * 1024) { showToast(`${file.name} 超过5MB，已跳过`, 'error'); return; }
        const reader = new FileReader();
        reader.onload = function(ev) {
            const fileData = { name: file.name, type: file.type, size: file.size, data: ev.target.result };
            if (type === 'service') {
                uploadState.serviceSamples.push(fileData);
                renderSampleList('serviceSampleList', uploadState.serviceSamples, 'service');
            } else {
                uploadState.taskFiles.push(fileData);
                renderSampleList('taskSampleList', uploadState.taskFiles, 'task');
            }
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function renderSampleList(elementId, files, type) {
    const el = document.getElementById(elementId);
    el.innerHTML = files.map((f, i) => {
        const isImage = f.type?.startsWith('image/');
        const icon = f.type?.includes('video') ? '🎬' : f.type?.includes('audio') ? '🎵' : f.type?.includes('pdf') ? '📕' : f.name?.endsWith('.doc') || f.name?.endsWith('.docx') ? '📘' : f.name?.endsWith('.xls') || f.name?.endsWith('.xlsx') ? '📗' : f.name?.endsWith('.zip') ? '🗜️' : '📄';
        return `<div class="sample-item">
            ${isImage ? `<img src="${f.data}" alt="${f.name}">` : `<span class="sample-file-icon">${icon}</span>`}
            <span class="sample-name">${f.name}</span>
            <span class="sample-remove" onclick="removeSample('${type}',${i})">×</span>
        </div>`;
    }).join('');
}

function removeSample(type, index) {
    if (type === 'service') { uploadState.serviceSamples.splice(index, 1); renderSampleList('serviceSampleList', uploadState.serviceSamples, 'service'); }
    else { uploadState.taskFiles.splice(index, 1); renderSampleList('taskSampleList', uploadState.taskFiles, 'task'); }
}

// ========== 头像上传 ==========
function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) { showToast('头像不能超过1MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = function(ev) {
        uploadState.regAvatar = ev.target.result;
        document.getElementById('regAvatarPreview').src = ev.target.result;
        document.getElementById('regAvatarPreview').style.display = 'block';
        document.getElementById('regAvatarPlaceholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// ========== 注册/登录 ==========
function showRegisterModal() {
    uploadState.regAvatar = null;
    document.getElementById('regAvatarPreview').style.display = 'none';
    document.getElementById('regAvatarPlaceholder').style.display = 'block';
    document.getElementById('regSkillGroup').style.display = 'none';
    openModal('registerModal');
}

function doRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    if (!username || !password) { showToast('账号和密码不能为空', 'error'); return; }
    const payload = {
        username,
        password,
        real_name: document.getElementById('regRealName').value.trim() || username,
        user_type: parseInt(document.getElementById('regUserType').value),
        skill_tag: document.getElementById('regSkillTag').value,
        phone: document.getElementById('regPhone').value,
        avatar: uploadState.regAvatar || null
    };
    fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
        if (!ok) { showToast(data.error || '注册失败', 'error'); return; }
        // 注册成功后自动登录（服务端分配用户id + token，跨设备唯一）
        applyLoginUser(Object.assign({}, data.user, { token: data.token }));
        closeModal('registerModal');
        renderAll();
        updateNavRole();
        showToast('注册成功！', 'success');
        switchPage('home');
    })
    .catch(err => showToast('注册失败：' + err.message + '，请检查网络', 'error'));
}

function showLoginModal() { openModal('loginModal'); }

function doLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) { showToast('请输入账号和密码', 'error'); return; }
    fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
        if (!ok) { showToast(data.error || '账号或密码错误', 'error'); return; }
        applyLoginUser(Object.assign({}, data.user, { token: data.token }));
        closeModal('loginModal');
        renderAll();
        updateNavRole();
        showToast('登录成功', 'success');
        switchPage(currentPage);
    })
    .catch(err => showToast('登录失败：' + err.message + '，请检查网络', 'error'));
}

/**
 * 登录/注册成功后写入会话与本地用户缓存
 */
function applyLoginUser(user) {
    currentUser = user;
    DB.set('sp_current_user', user);
    currentRole = user.user_type === 1 ? 'tech' : 'user';
    DB.set('sp_role', currentRole);
    const users = DB.get('sp_users', []);
    const i = users.findIndex(u => Number(u.id) === Number(user.id));
    if (i >= 0) users[i] = user; else users.push(user);
    DB.set('sp_users', users);
}

function logout() {
    currentUser = null;
    currentChatKey = null;
    DB.remove('sp_current_user');
    renderAll();
    updateNavRole();
    showToast('已退出登录', 'success');
    switchPage('home');
}

// ========== 搜索 ==========
function handleSearch(e) { if (e.key === 'Enter') doSearch(); }
function doSearch() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!q) return;
    if (currentRole === 'tech') {
        switchPage('market');
        const services = DB.get('sp_services', []).filter(s => s.status === 1 && (s.title.toLowerCase().includes(q) || s.service_desc.toLowerCase().includes(q) || (s.tags||[]).some(t => t.toLowerCase().includes(q))));
        document.getElementById('marketServiceGrid').innerHTML = services.map(s => serviceCardHTML(s)).join('') || '<p style="color:#8D87A3;">未找到相关服务</p>';
    } else {
        switchPage('tech-hall');
        const tasks = DB.get('sp_tasks', []).filter(t => t.status === 0 && (t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)));
        document.getElementById('taskGrid').innerHTML = tasks.map(t => taskCardHTML(t)).join('') || '<p style="color:#8D87A3;">未找到相关任务</p>';
    }
}

// ========== 轮播 ==========
function initCarousel() {
    const dots = document.getElementById('carouselDots');
    const slides = document.querySelectorAll('.carousel-slide');
    dots.innerHTML = Array.from(slides).map((_, i) => `<span class="carousel-dot ${i===0?'active':''}" onclick="goToSlide(${i})"></span>`).join('');
    startCarousel();
}
function startCarousel() {
    if (carouselTimer) clearInterval(carouselTimer);
    carouselTimer = setInterval(() => carouselNext(), 5000);
}
function carouselNext() {
    const total = document.querySelectorAll('.carousel-slide').length;
    carouselIndex = (carouselIndex + 1) % total;
    updateCarousel();
}
function carouselPrev() {
    const total = document.querySelectorAll('.carousel-slide').length;
    carouselIndex = (carouselIndex - 1 + total) % total;
    updateCarousel();
}
function goToSlide(i) { carouselIndex = i; updateCarousel(); startCarousel(); }
function updateCarousel() {
    document.getElementById('carouselTrack').style.transform = `translateX(-${carouselIndex * 100}%)`;
    document.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === carouselIndex));
}

// ========== 滚动动画 ==========
function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => observer.observe(el));
}

// ========== 工具函数 ==========
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + (type || '');
    setTimeout(() => toast.className = 'toast', 2500);
}
function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff/60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff/3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff/86400000) + '天前';
    return `${d.getMonth()+1}/${d.getDate()}`;
}

// 点击弹窗外部关闭
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) e.target.classList.remove('active');
});
