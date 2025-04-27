const express = require('express');
const path = require('path');
const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');

const app = express();
const port = 4000;

// 配置静态文件目录
app.use(express.static('public'));

// 设置视图引擎
app.set('view engine', 'ejs');

// 创建飞书客户端
const client = new lark.Client({
    appId: 'cli_a71dc5597639d00e',
    appSecret: '9TIE8RgefCY8dOKidGgA1b22e2yu5lL4',
    disableTokenCache: false
});

// 使用JSON文件作为简单的数据存储
const DB_FILE = 'db.json';

// 读取数据库文件
function readDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('读取数据库文件失败:', error);
    }
    return null;
}

// 写入数据库文件
function writeDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('写入数据库文件失败:', error);
        return false;
    }
}

// 获取多维表格数据的API端点
app.get('/api/table-data', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        
        // 如果不是强制刷新，尝试从数据库读取
        if (!forceRefresh) {
            const cachedData = readDatabase();
            if (cachedData) {
                console.log('从数据库读取数据');
                return res.json(cachedData);
            }
        }

        console.log('开始获取tenant_access_token...');
        const tokenRes = await client.auth.tenantAccessToken.internal({});
        const tenantToken = tokenRes.tenant_access_token;

        console.log('开始获取表格元数据...');
        // 获取表格元数据
        const tableMetaData = await client.bitable.v1.appTableField.list({
            path: {
                app_token: 'UMj1b3qYga81q3syxEccximEn5c',
                table_id: 'tblLdNNmy3IjI1DI'
            }
        }, lark.withTenantToken(tenantToken));

        console.log('开始获取表格记录...');
        
        // 获取所有记录
        let allRecords = [];
        let pageToken = '';
        let total = 0;
        
        do {
            // 获取当前页的记录
            const records = await client.bitable.v1.appTableRecord.list({
                path: {
                    app_token: 'UMj1b3qYga81q3syxEccximEn5c',
                    table_id: 'tblLdNNmy3IjI1DI'
                },
                params: {
                    page_size: 500,
                    page_token: pageToken
                }
            }, lark.withTenantToken(tenantToken));
            
            // 将当前页的记录添加到总记录中
            if (records.data && records.data.items) {
                allRecords = allRecords.concat(records.data.items);
                total = records.data.total || allRecords.length;
                pageToken = records.data.page_token;
            }
            
            // 如果没有下一页，退出循环
            if (!pageToken) {
                break;
            }
        } while (allRecords.length < total);

        console.log(`获取到的总记录数: ${allRecords.length}`);

        // 检查数据结构
        if (!allRecords || allRecords.length === 0) {
            console.log('未找到任何记录');
            return res.status(404).json({ 
                error: '未找到任何记录'
            });
        }

        // 准备返回的数据
        const responseData = {
            records: {
                code: 0,
                data: {
                    items: allRecords,
                    total: total
                },
                msg: "success"
            },
            tableMetaData: tableMetaData
        };

        // 将数据保存到数据库
        if (forceRefresh) {
            console.log('更新数据库...');
            writeDatabase(responseData);
        }

        // 返回成功的数据
        res.json(responseData);
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
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// 商品详情页路由
app.get('/product/detail', (req, res) => {
    res.sendFile(path.join(__dirname, 'product_detail.html'));
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 