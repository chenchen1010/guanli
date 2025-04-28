const express = require('express');
const path = require('path');
const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const port = 4000;

// 配置静态文件目录
app.use(express.static('public'));
app.use(express.json());

// 配置会话中间件
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // 在生产环境中应设置为 true
}));

// 设置视图引擎
app.set('view engine', 'ejs');

// 用户认证中间件
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// 创建飞书客户端
const client = new lark.Client({
    appId: 'cli_a71dc5597639d00e',
    appSecret: '9TIE8RgefCY8dOKidGgA1b22e2yu5lL4',
    disableTokenCache: false
});

// 数据文件路径
const dataFilePath = path.join(__dirname, 'bd.json');

// 从飞书获取数据并保存到本地文件
async function fetchDataFromFeishu() {
    try {
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
            throw new Error('未找到任何记录');
        }

        // 构建数据对象
        const data = {
            records: {
                code: 0,
                data: {
                    items: allRecords,
                    total: total
                },
                msg: "success"
            },
            tableMetaData: tableMetaData,
            lastUpdated: new Date().toISOString()
        };
        
        // 将数据保存到文件
        fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
        console.log('数据已保存到文件:', dataFilePath);
        
        return data;
    } catch (error) {
        console.error('获取飞书数据错误:', error);
        throw error;
    }
}

// 从本地文件读取数据
function readDataFromFile() {
    try {
        if (fs.existsSync(dataFilePath)) {
            const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            console.log(`从文件读取的数据记录数: ${data.records.data.items.length}`);
            return data;
        } else {
            console.log('数据文件不存在，将从飞书获取数据');
            return null;
        }
    } catch (error) {
        console.error('读取数据文件错误:', error);
        return null;
    }
}

// 用户相关路由
app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/');
        return;
    }
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/register', (req, res) => {
    if (req.session.user) {
        res.redirect('/');
        return;
    }
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, phone, password } = req.body;
        
        // 读取现有用户数据
        let users = [];
        if (fs.existsSync('users.json')) {
            users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
        }
        
        // 检查用户名是否已存在
        if (users.some(user => user.username === username)) {
            res.status(400).json({ message: '用户名已存在' });
            return;
        }
        
        // 检查手机号是否已存在
        if (users.some(user => user.phone === phone)) {
            res.status(400).json({ message: '手机号已被注册' });
            return;
        }
        
        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 添加新用户
        users.push({
            username,
            phone,
            password: hashedPassword
        });
        
        // 保存用户数据
        fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
        
        res.json({ message: '注册成功' });
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ message: '注册失败，请稍后重试' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 读取用户数据
        if (!fs.existsSync('users.json')) {
            res.status(401).json({ message: '用户名或密码错误' });
            return;
        }
        
        const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
        const user = users.find(u => u.username === username);
        
        if (!user) {
            res.status(401).json({ message: '用户名或密码错误' });
            return;
        }
        
        // 验证密码
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            res.status(401).json({ message: '用户名或密码错误' });
            return;
        }
        
        // 设置会话
        req.session.user = {
            username: user.username,
            phone: user.phone
        };
        
        res.json({ message: '登录成功' });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ message: '登录失败，请稍后重试' });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: '已退出登录' });
});

// 获取表格数据的API端点 - 优先从文件读取
app.get('/api/table-data', requireAuth, async (req, res) => {
    try {
        // 从文件读取数据
        let data = readDataFromFile();
        
        // 如果文件不存在或数据无效，则从飞书获取
        if (!data) {
            data = await fetchDataFromFeishu();
        }
        
        // 添加用户信息到返回数据中
        data.user = {
            username: req.session.user.username,
            phone: req.session.user.phone
        };
        
        res.json(data);
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

// 更新数据的API端点 - 强制从飞书获取
app.get('/api/update-data', requireAuth, async (req, res) => {
    try {
        console.log('接收到更新数据请求');
        const data = await fetchDataFromFeishu();
        res.json({
            success: true,
            message: '数据已成功更新',
            lastUpdated: data.lastUpdated,
            totalRecords: data.records.data.total
        });
    } catch (error) {
        console.error('更新数据错误:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 主页路由
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 