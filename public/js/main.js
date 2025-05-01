// 全局变量和配置
const config = {
    apiEndpoint: 'https://open.feishu.cn/open-apis/bitable/v1/apps/',
    tableId: 'YOUR_TABLE_ID'
};

// 数据加载和处理
async function loadData() {
    try {
        showLoading(true);
        const response = await fetchTableData();
        const data = await response.json();
        renderTable(data);
        updateStats(data);
    } catch (error) {
        showError('数据加载失败：' + error.message);
    } finally {
        showLoading(false);
    }
}

// UI状态控制
function showLoading(show) {
    const loading = document.querySelector('.loading');
    if (loading) {
        loading.style.display = show ? 'block' : 'none';
    }
}

function showError(message) {
    const error = document.querySelector('.error');
    if (error) {
        error.textContent = message;
        error.style.display = 'block';
    }
}

// 表格渲染
function renderTable(data) {
    const tableBody = document.querySelector('table tbody');
    if (!tableBody || !data.items) return;

    tableBody.innerHTML = '';
    data.items.forEach(item => {
        const row = document.createElement('tr');
        // 根据数据结构填充表格内容
        tableBody.appendChild(row);
    });
}

// 统计信息更新
function updateStats(data) {
    const stats = document.querySelector('.stats');
    if (!stats || !data.summary) return;

    stats.innerHTML = `
        总记录数：${data.summary.total}
        当前页：${data.summary.page}/${data.summary.totalPages}
    `;
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    loadData();
}); 