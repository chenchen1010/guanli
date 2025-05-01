// API配置
const API_CONFIG = {
    baseUrl: 'https://open.feishu.cn/open-apis/bitable/v1/',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '
    }
};

// API请求处理
async function fetchTableData(appToken, tableId) {
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}apps/${appToken}/tables/${tableId}/records`, {
            method: 'GET',
            headers: API_CONFIG.headers
        });
        return await response.json();
    } catch (error) {
        console.error('获取表格数据失败:', error);
        throw error;
    }
}

// 数据更新处理
async function updateTableRecord(appToken, tableId, recordId, data) {
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}apps/${appToken}/tables/${tableId}/records/${recordId}`, {
            method: 'PUT',
            headers: API_CONFIG.headers,
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        console.error('更新记录失败:', error);
        throw error;
    }
}

// 导出API函数
export {
    fetchTableData,
    updateTableRecord
}; 