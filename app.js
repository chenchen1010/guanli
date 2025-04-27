const express = require('express');
const path = require('path');
const lark = require('@larksuiteoapi/node-sdk');

const app = express();
const port = 4000;

// 配置静态文件目录
app.use(express.static('public'));

// 创建飞书客户端
const client = new lark.Client({
    appId: 'cli_a71dc5597639d00e',
    appSecret: '9TIE8RgefCY8dOKidGgA1b22e2yu5lL4',
    disableTokenCache: false
});

// 获取多维表格数据的API端点
app.get('/api/table-data', async (req, res) => {
    try {
        console.log('开始获取tenant_access_token...');
        const tokenRes = await client.auth.tenantAccessToken.internal({});
        console.log('获取到的token:', tokenRes);
        
        const tenantToken = tokenRes.tenant_access_token;
        console.log('tenant_access_token:', tenantToken);

        console.log('开始获取表格基本信息...');
        // 获取表格基本信息
        const appInfo = await client.bitable.v1.app.get({
            path: {
                app_token: 'UMj1b3qYga81q3syxEccximEn5c',
            }
        }, lark.withTenantToken(tenantToken));
        console.log('表格基本信息:', JSON.stringify(appInfo, null, 2));

        console.log('开始获取表格列表...');
        // 获取表格数据
        const tableData = await client.bitable.v1.appTable.list({
            path: {
                app_token: 'UMj1b3qYga81q3syxEccximEn5c',
            }
        }, lark.withTenantToken(tenantToken));
        console.log('表格列表:', JSON.stringify(tableData, null, 2));

        console.log('开始获取表格记录...');
        // 获取具体表格的记录
        const records = await client.bitable.v1.appTableRecord.list({
            path: {
                app_token: 'UMj1b3qYga81q3syxEccximEn5c',
                table_id: 'tblLdNNmy3IjI1DI'
            },
            params: {
                page_size: 100  // 设置每页返回的记录数
            }
        }, lark.withTenantToken(tenantToken));
        console.log('表格记录:', JSON.stringify(records, null, 2));

        if (!records || !records.items || records.items.length === 0) {
            console.log('未找到任何记录');
            return res.status(404).json({ 
                error: '未找到任何记录',
                details: {
                    appInfo: appInfo,
                    tableData: tableData,
                    records: records
                }
            });
        }

        res.json({
            appInfo: appInfo,
            tableData: tableData,
            records: records
        });
    } catch (error) {
        console.error('错误详情:', error);
        if (error.response) {
            console.error('API响应错误:', {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers
            });
        }
        res.status(500).json({ 
            error: error.message,
            details: error.response ? error.response.data : null,
            type: error.constructor.name
        });
    }
});

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 