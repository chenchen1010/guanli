const express = require('express');
const path = require('path');
const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fsPromises = require('fs').promises;
// 引入dotenv加载环境变量
const dotenv = require('dotenv');
// 引入OpenAI库用于调用火山方舟AI
const OpenAI = require('openai');

// 加载环境变量
dotenv.config();

// 初始化火山方舟AI客户端
const openai = new OpenAI({
  apiKey: process.env.ARK_API_KEY || 'e55940e4-f583-43b1-9c4e-58e651e5a66d',
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
});

const app = express();
const port = 4000;

// 配置JSON解析
app.use(express.json());

// 配置会话中间件
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // 在生产环境中应设置为 true
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
        httpOnly: true, // 防止客户端脚本访问cookie
        sameSite: 'strict' // 防止CSRF攻击
    },
    name: 'sessionId', // 自定义会话cookie名称,
    rolling: true // 每次请求都重置cookie过期时间
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

// 创建classes.json文件用于存储课程数据
const classesFilePath = path.join(__dirname, 'classes.json');
if (!fs.existsSync(classesFilePath)) {
    fs.writeFileSync(classesFilePath, '[]', 'utf8');
}

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

// 添加classes路由，确保需要登录才能访问
app.get('/classes', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'classes.html'));
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

// 检查登录状态的API
app.get('/api/check-login', (req, res) => {
    if (req.session.user) {
        res.json({
            isLoggedIn: true,
            username: req.session.user.username,
            phone: req.session.user.phone
        });
    } else {
        res.json({ isLoggedIn: false });
    }
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

// 日志记录函数
async function logOperation(operation, details, username) {
    try {
        const timestamp = new Date().toLocaleString('zh-CN');
        const logEntry = {
            timestamp,
            username,
            operation,
            details
        };
        
        const logPath = path.join(__dirname, 'operations.log');
        
        // 读取现有日志，如果不存在则创建空数组
        let logs = [];
        try {
            if (fs.existsSync(logPath)) {
                const logContent = await fsPromises.readFile(logPath, 'utf8');
                if (logContent.trim()) {
                    logs = JSON.parse(logContent);
                    if (!Array.isArray(logs)) {
                        logs = [];
                    }
                }
            }
        } catch (readError) {
            console.error('读取日志文件失败，将创建新日志文件:', readError);
            logs = [];
        }
        
        // 添加新日志
        logs.push(logEntry);
        
        // 写入日志文件
        await fsPromises.writeFile(logPath, JSON.stringify(logs, null, 2), 'utf8');
        console.log('日志已记录:', logEntry);
    } catch (error) {
        console.error('写入日志失败:', error);
    }
}

// 获取操作日志API
app.get('/api/logs', requireAuth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const logPath = path.join(__dirname, 'operations.log');
        
        // 如果日志文件不存在，返回空数组
        if (!fs.existsSync(logPath)) {
            return res.json({ success: true, logs: [] });
        }
        
        // 读取日志文件
        const logContent = await fsPromises.readFile(logPath, 'utf8');
        
        // 解析日志内容
        let logs = [];
        if (logContent.trim()) {
            try {
                logs = JSON.parse(logContent);
                if (!Array.isArray(logs)) {
                    logs = [];
                }
            } catch (parseError) {
                console.error('解析日志文件失败:', parseError);
                return res.status(500).json({ success: false, message: '日志文件格式错误' });
            }
        }
        
        // 根据日期范围筛选日志
        if (startDate || endDate) {
            console.log(`按日期筛选日志: 开始日期=${startDate}, 结束日期=${endDate}`);
            
            const startDateTime = startDate ? new Date(startDate) : new Date(0);
            // 如果提供了结束日期，设置时间为当天的23:59:59
            const endDateTime = endDate ? new Date(endDate) : new Date();
            if (endDate) {
                endDateTime.setHours(23, 59, 59, 999);
            }
            
            // 筛选符合日期范围的日志
            logs = logs.filter(log => {
                // 将日志的时间戳转换为Date对象
                // 由于中国日期格式(如"2023/5/25 14:30:45")可能不被所有浏览器正确解析
                // 我们手动解析时间戳
                let logDate;
                try {
                    // 尝试直接解析
                    logDate = new Date(log.timestamp);
                    
                    // 如果解析结果无效，尝试手动解析中文日期格式
                    if (isNaN(logDate.getTime())) {
                        const parts = log.timestamp.split(/[\/\s:]/);
                        if (parts.length >= 6) {
                            // 根据"年/月/日 时:分:秒"格式解析
                            logDate = new Date(
                                parseInt(parts[0]), 
                                parseInt(parts[1]) - 1, // 月份从0开始
                                parseInt(parts[2]),
                                parseInt(parts[3]),
                                parseInt(parts[4]),
                                parseInt(parts[5])
                            );
                        }
                    }
                } catch (e) {
                    console.error('解析日志日期失败:', log.timestamp, e);
                    return false; // 解析失败的日志条目不包含在结果中
                }
                
                // 验证解析后的日期是否有效
                if (!logDate || isNaN(logDate.getTime())) {
                    console.error('无效的日志日期:', log.timestamp);
                    return false;
                }
                
                // 判断日期是否在指定范围内
                return logDate >= startDateTime && logDate <= endDateTime;
            });
            
            console.log(`筛选后找到 ${logs.length} 条日志记录`);
        }
        
        // 返回日志数组（最新的在前面）
        res.json({ success: true, logs: logs.reverse() });
    } catch (error) {
        console.error('读取日志失败:', error);
        res.status(500).json({ success: false, message: '读取日志失败' });
    }
});

// 学员相关 API
app.post('/api/students/add', requireAuth, async (req, res) => {
    try {
        console.log('收到添加学员请求');
        console.log('会话信息:', req.session);
        console.log('用户信息:', req.session.user);
        console.log('请求体:', req.body);
        
        const { courseId, courseName, students } = req.body;
        
        if (!req.session.user) {
            console.log('用户未登录');
            return res.status(401).json({ message: '请先登录' });
        }
        
        // 读取现有学员数据
        let allStudents = [];
        if (fs.existsSync('students.json')) {
            console.log('读取现有学员数据');
            allStudents = JSON.parse(fs.readFileSync('students.json', 'utf8'));
            console.log('现有学员数量:', allStudents.length);
        }
        
        // 处理每个学员数据
        console.log('开始处理新学员数据');
        const newStudents = students.map(student => {
            const newStudent = {
                ...student,
                courseId,
                courseName,
                addedBy: req.session.user.username,
                addedAt: new Date().toISOString(),
                id: Date.now() + Math.random().toString(36).substr(2, 9)
            };
            console.log('处理学员:', newStudent);
            return newStudent;
        });
        
        // 添加新学员
        allStudents.push(...newStudents);
        console.log('新增学员数量:', newStudents.length);
        
        // 保存数据
        console.log('保存数据到文件');
        fs.writeFileSync('students.json', JSON.stringify(allStudents, null, 2));
        
        // 构建详细的日志记录
        const studentsInfo = newStudents.map(student => 
            `${student.wechatName}(¥${student.amount}/${student.status}${student.preferredTime ? '/'+student.preferredTime : ''})`
        ).join('、');
        
        await logOperation(
            '添加学员',
            `课程: ${courseName}(${courseId}), 添加${students.length}名学员: ${studentsInfo}`,
            req.session.user.username
        );
        
        console.log('添加学员成功');
        res.json({ 
            message: '添加成功', 
            count: newStudents.length,
            students: newStudents
        });
    } catch (error) {
        console.error('添加学员错误:', error);
        console.error('错误堆栈:', error.stack);
        res.status(500).json({ message: '添加学员失败，请稍后重试', error: error.message });
    }
});

app.get('/api/students/:courseId', requireAuth, (req, res) => {
    try {
        const { courseId } = req.params;
        
        // 读取学员数据
        if (!fs.existsSync('students.json')) {
            res.json([]);
            return;
        }
        
        const allStudents = JSON.parse(fs.readFileSync('students.json', 'utf8'));
        const courseStudents = allStudents.filter(student => student.courseId === courseId);
        
        res.json(courseStudents);
    } catch (error) {
        console.error('获取学员列表错误:', error);
        res.status(500).json({ message: '获取学员列表失败，请稍后重试' });
    }
});

// 处理学员更新 - PUT 方法版本
app.put('/api/students/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        
        console.log('【API】收到更新学员请求:');
        console.log('- 学员ID:', id);
        console.log('- 更新数据:', JSON.stringify(updatedData, null, 2));
        
        // 验证更新数据的完整性
        if (!updatedData || typeof updatedData !== 'object') {
            console.error('【API】无效的更新数据格式');
            return res.status(400).json({ success: false, message: '无效的更新数据格式' });
        }

        // 确保必要字段存在
        const requiredFields = ['wechatName'];
        for (const field of requiredFields) {
            if (updatedData[field] === undefined) {
                console.error(`【API】缺少必要字段: ${field}`);
                return res.status(400).json({ success: false, message: `缺少必要字段: ${field}` });
            }
        }
        
        // 读取现有学员数据
        if (!fs.existsSync('students.json')) {
            console.error('【API】students.json文件不存在');
            return res.status(404).json({ success: false, message: '找不到学员数据文件' });
        }
        
        // 读取并解析学员数据
        console.log('【API】开始读取students.json文件');
        let studentsData;
        try {
            studentsData = fs.readFileSync('students.json', 'utf8');
        } catch (readError) {
            console.error('【API】读取students.json失败:', readError);
            return res.status(500).json({ success: false, message: '读取学员数据失败' });
        }

        let students;
        try {
            students = JSON.parse(studentsData);
            console.log(`【API】成功解析students.json，共有${students.length}条记录`);
        } catch (parseError) {
            console.error('【API】解析students.json失败:', parseError);
            return res.status(500).json({ success: false, message: '学员数据文件损坏' });
        }
        
        // 查找要更新的学员
        const studentIndex = students.findIndex(s => s.id === id);
        console.log('【API】在students.json中查找学员索引:', studentIndex);
        
        if (studentIndex === -1) {
            console.error('【API】在students.json中找不到学员:', id);
            return res.status(404).json({ success: false, message: '找不到指定学员' });
        }
        
        // 记录变更内容
        const oldStudent = students[studentIndex];
        const changes = [];
        
        // 检查并记录每个字段的变化
        const fieldsToCheck = {
            wechatName: '微信名',
            amount: '金额',
            channel: '渠道',
            status: '状态',
            preferredTime: '意向时间',
            remarks: '备注'
        };

        for (const [field, label] of Object.entries(fieldsToCheck)) {
            if (updatedData[field] !== undefined && updatedData[field] !== oldStudent[field]) {
                changes.push(`${label}: ${oldStudent[field] || '无'} -> ${updatedData[field] || '无'}`);
            }
        }
        
        console.log('【API】变更内容:', changes);
        
        // 处理状态变更相关的时间字段
        const now = new Date().toISOString();
        if (updatedData.status !== oldStudent.status) {
            switch (updatedData.status) {
                case '已退款':
                    updatedData.refundDate = now;
                    break;
                case '已开班':
                    // 如果有班级ID，获取班级的开始时间作为开班日期
                    if (updatedData.classId) {
                        const classesData = fs.readFileSync('classes.json', 'utf8');
                        const classes = JSON.parse(classesData);
                        const classInfo = classes.find(c => c.id === updatedData.classId);
                        if (classInfo) {
                            updatedData.classStartDate = classInfo.startTime;
                        } else {
                            updatedData.classStartDate = '2000-01-01T00:00:00+08:00';
                        }
                    } else {
                        updatedData.classStartDate = '2000-01-01T00:00:00+08:00';
                    }
                    break;
                case '已结算':
                    updatedData.settleDate = now;
                    break;
            }
        }
        
        // 更新students.json中的学员数据
        const updatedStudent = {
            ...oldStudent,
            ...updatedData,
            updatedAt: now
        };
        
        students[studentIndex] = updatedStudent;
        
        // 保存更新后的students.json
        console.log('【API】开始保存更新后的students.json');
        try {
            const tempFile = 'students.json.temp';
            fs.writeFileSync(tempFile, JSON.stringify(students, null, 2));
            fs.renameSync(tempFile, 'students.json');
            console.log('【API】students.json保存成功');
        } catch (writeError) {
            console.error('【API】保存students.json失败:', writeError);
            return res.status(500).json({ success: false, message: '保存学员数据失败' });
        }

        // 记录操作日志
        try {
            await logOperation(
                '更新学员信息',
                `学员: ${updatedStudent.wechatName}, 变更: ${changes.join(', ')}`,
                req.session.user.username
            );
        } catch (logError) {
            console.error('【API】记录操作日志失败:', logError);
            // 不中断操作，继续返回成功
        }

        // 返回更新后的数据
        console.log('【API】返回更新成功响应');
        res.json({
            success: true,
            message: '更新成功',
            student: updatedStudent,
            changes
        });
        
    } catch (error) {
        console.error('【API】更新学员数据时出错:', error);
        console.error('【API】错误堆栈:', error.stack);
        res.status(500).json({ success: false, message: '更新学员数据失败，请稍后重试' });
    }
});

// 获取意向上课时间列表
app.get('/api/preferred-times', requireAuth, async (req, res) => {
    try {
        // 读取学员数据
        let allTimes = new Set(['周一晚上', '周二晚上', '周三晚上', '周四晚上', '周五晚上', '周六上午', '周六下午', '周日上午', '周日下午']);
        
        if (fs.existsSync('students.json')) {
            const students = JSON.parse(fs.readFileSync('students.json', 'utf8'));
            // 从现有学员中获取所有不同的意向上课时间
            students.forEach(student => {
                if (student.preferredTime && student.preferredTime.trim()) {
                    allTimes.add(student.preferredTime.trim());
                }
            });
        }
        
        // 转换为数组并按字母顺序排序
        const timesList = Array.from(allTimes).sort();
        res.json({ success: true, times: timesList });
    } catch (error) {
        console.error('获取意向上课时间列表失败:', error);
        res.status(500).json({ success: false, message: '获取意向上课时间列表失败' });
    }
});

// 获取招生渠道列表
app.get('/api/channels', requireAuth, async (req, res) => {
    try {
        // 读取学员数据
        let allChannels = new Set(['朋友介绍', '微信群', '公众号', '小红书', '抖音', '社区活动', '新趣', '其他']);
        
        if (fs.existsSync('students.json')) {
            const students = JSON.parse(fs.readFileSync('students.json', 'utf8'));
            // 从现有学员中获取所有不同的招生渠道
            students.forEach(student => {
                if (student.channel && student.channel.trim()) {
                    allChannels.add(student.channel.trim());
                }
            });
        }
        
        // 转换为数组并按字母顺序排序
        const channelsList = Array.from(allChannels).sort();
        res.json({ success: true, channels: channelsList });
    } catch (error) {
        console.error('获取招生渠道列表失败:', error);
        res.status(500).json({ success: false, message: '获取招生渠道列表失败' });
    }
});

// 创建班级API
app.post('/api/classes/create', requireAuth, async (req, res) => {
    try {
        console.log('【API】收到创建班级请求');
        const { className, startTime, duration, location, students } = req.body;
        console.log('- 班级名称:', className);
        console.log('- 开始时间:', startTime);
        console.log('- 学员:', students);

        // 验证必要字段
        if (!className || !startTime || !duration || !location || !students || !Array.isArray(students) || students.length === 0) {
            console.log('【API】缺少必要信息');
            return res.status(400).json({ success: false, message: '缺少必要信息' });
        }

        // 读取班级数据
        let classes = [];
        if (fs.existsSync('classes.json')) {
            console.log('【API】读取现有班级数据');
            const classesData = fs.readFileSync('classes.json', 'utf8');
            classes = JSON.parse(classesData);
        }

        // 创建新班级
        const newClass = {
            id: `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            className,
            startTime,
            duration: parseInt(duration),
            location,
            students: students.map(s => s.id), // 只存储学员ID
            createdBy: req.session.user.username,
            createdAt: new Date().toISOString()
        };
        console.log('【API】新班级对象:', newClass);

        // 更新学员状态和班级信息
        try {
            console.log('【API】开始更新学员状态和班级信息');
            if (!fs.existsSync('students.json')) {
                fs.writeFileSync('students.json', '[]', 'utf8');
            }
            const studentsData = fs.readFileSync('students.json', 'utf8');
            let allStudents = JSON.parse(studentsData);
            
            // 获取要更新的学员ID列表
            const studentIds = students.map(s => s.id);
            const now = new Date().toISOString();
            
            // 更新学员状态和班级信息
            allStudents = allStudents.map(student => {
                if (studentIds.includes(student.id)) {
                    return {
                        ...student,
                        status: '已开班',
                        classStartDate: startTime, // 使用班级的开始时间
                        classId: newClass.id,
                        className: newClass.className,
                        updatedAt: now
                    };
                }
                return student;
            });
            
            // 保存更新后的学员数据
            fs.writeFileSync('students.json', JSON.stringify(allStudents, null, 2));
            console.log('【API】学员状态和班级信息更新成功');
        } catch (error) {
            console.error('【API】更新学员状态和班级信息失败:', error);
            return res.status(500).json({ success: false, message: '更新学员状态失败' });
        }

        // 添加新班级
        classes.push(newClass);
        
        // 保存班级数据
        fs.writeFileSync('classes.json', JSON.stringify(classes, null, 2));
        console.log('【API】班级数据保存成功');

        // 记录操作日志
        await logOperation(
            '创建班级',
            `班级: ${className}, 学员数: ${students.length}`,
            req.session.user.username
        );

        res.json({ success: true, message: '创建班级成功', class: newClass });
    } catch (error) {
        console.error('【API】创建班级失败:', error);
        res.status(500).json({ success: false, message: '创建班级失败' });
    }
});

// 获取课程列表API
app.get('/api/classes', requireAuth, async (req, res) => {
    try {
        console.log('【API】开始获取课程列表');
        // 读取课程数据
        if (!fs.existsSync(classesFilePath)) {
            console.log('【API】课程文件不存在，返回空数组');
            return res.json([]);
        }

        const classesData = await fs.promises.readFile(classesFilePath, 'utf8');
        console.log('【API】成功读取课程文件');
        
        const classes = JSON.parse(classesData);
        console.log(`【API】解析成功，共有 ${classes.length} 个班级`);
        
        res.json(classes);
    } catch (error) {
        console.error('【API】获取课程列表失败:', error);
        res.status(500).json({ success: false, message: '获取课程列表失败' });
    }
});

// 获取班级学员API
app.get('/api/classes/:classId/students', requireAuth, (req, res) => {
    try {
        const { classId } = req.params;
        console.log('【API】开始获取班级学员');
        console.log('- classId:', classId);

        // 读取班级数据
        if (!fs.existsSync('classes.json')) {
            console.log('【API】classes.json不存在，返回空数组');
            return res.json([]);
        }

        // 读取并解析班级数据
        const classesData = fs.readFileSync('classes.json', 'utf8');
        const classes = JSON.parse(classesData);
        console.log('【API】成功读取班级数据');

        // 查找指定班级
        const classData = classes.find(c => c.id === classId);
        if (!classData) {
            console.log('【API】找不到指定班级:', classId);
            return res.json([]);
        }
        console.log('【API】找到班级:', classData);

        // 确保学员列表是数组
        if (!Array.isArray(classData.students)) {
            console.log('【API】学员列表不是数组，初始化为空数组');
            classData.students = [];
        }

        // 读取学员数据
        if (!fs.existsSync('students.json')) {
            console.log('【API】students.json不存在，返回空数组');
            return res.json([]);
        }

        // 读取并解析学员数据
        const studentsData = fs.readFileSync('students.json', 'utf8');
        const allStudents = JSON.parse(studentsData);
        console.log('【API】成功读取学员数据');

        // 获取班级中每个学员的完整信息
        const classStudents = classData.students
            .map(studentId => allStudents.find(s => s.id === studentId))
            .filter(student => student); // 过滤掉未找到的学员

        console.log('【API】找到', classStudents.length, '名学员');
        res.json(classStudents);

    } catch (error) {
        console.error('【API】获取班级学员失败:', error);
        res.status(500).json({ success: false, message: '获取班级学员失败' });
    }
});

// 获取所有学员列表
app.get('/api/students', requireAuth, (req, res) => {
    try {
        console.log('收到获取所有学员列表请求');
        res.setHeader('Content-Type', 'application/json');
        
        // 读取学员数据
        if (!fs.existsSync('students.json')) {
            console.log('students.json文件不存在，返回空数组');
            res.json([]);
            return;
        }
        
        const allStudents = JSON.parse(fs.readFileSync('students.json', 'utf8'));
        console.log(`成功读取所有学员数据，共${allStudents.length}条记录`);
        
        res.json(allStudents);
    } catch (error) {
        console.error('获取所有学员列表错误:', error);
        res.status(500).json({ message: '获取学员列表失败，请稍后重试' });
    }
});

// 测试API路由
app.get('/api/students/test', requireAuth, (req, res) => {
    try {
        console.log('收到API测试请求');
        res.json({ message: 'API测试成功' });
    } catch (error) {
        console.error('API测试失败:', error);
        res.status(500).json({ message: 'API测试失败' });
    }
});

app.get('/api/bd', requireAuth, (req, res) => {
    try {
        console.log('收到获取招生收益数据请求');
        res.setHeader('Content-Type', 'application/json');
        
        // 优先从本地文件读取数据
        let bdData = null;
        if (fs.existsSync('bd.json')) {
            try {
                const fileContent = fs.readFileSync('bd.json', 'utf8');
                bdData = JSON.parse(fileContent);
                console.log(`成功读取招生收益数据文件`);
            } catch (parseError) {
                console.error('解析bd.json失败:', parseError);
                // 如果解析失败，继续尝试从dataFilePath读取
            }
        }
        
        // 如果本地bd.json不存在或解析失败，尝试从飞书数据文件中读取
        if (!bdData && fs.existsSync(dataFilePath)) {
            try {
                const fileContent = fs.readFileSync(dataFilePath, 'utf8');
                const feishuData = JSON.parse(fileContent);
                
                if (feishuData && feishuData.records && feishuData.records.data) {
                    bdData = feishuData;
                    console.log('从飞书数据文件中获取招生收益数据');
                }
            } catch (dataFileError) {
                console.error('从dataFilePath读取数据失败:', dataFileError);
            }
        }
        
        // 如果两者都不存在或读取失败，返回空数据结构而不是空数组
        if (!bdData) {
            console.log('未找到招生收益数据，返回空数据结构');
            bdData = {
                records: {
                    code: 0,
                    data: {
                        items: [],
                        total: 0
                    },
                    msg: "success"
                },
                lastUpdated: new Date().toISOString()
            };
        }
        
        res.json(bdData);
    } catch (error) {
        console.error('获取招生收益数据错误:', error);
        // 发生错误时返回一个基本的数据结构，而不是错误信息，让前端能正常运行
        res.json({
            records: {
                code: 500,
                data: {
                    items: [],
                    total: 0
                },
                msg: "error",
                error: error.message
            },
            lastUpdated: new Date().toISOString()
        });
    }
});

// AI结算分析接口
app.post('/api/analyze-income', requireAuth, async (req, res) => {
    try {
        // 从请求中获取收益数据
        const { incomeData, filters } = req.body;
        
        console.log('收到AI分析请求，请求数据大小:', JSON.stringify(req.body).length);
        
        if (!incomeData) {
            return res.status(400).json({ error: '收益数据不能为空' });
        }
        
        // 准备提交给AI模型的提示词

        const prompt = `
        我是一位财务分析师，需要你帮我分析以下飞书夜校的收益数据，并给出建议：
        
        详细数据:
        ${JSON.stringify(incomeData.details ? incomeData.details.slice(0, 10) : [], null, 2)}
        ${incomeData.details && incomeData.details.length > 10 ? `...以及其他 ${incomeData.details.length - 10} 条数据` : ''}
        
        ${filters ? `应用的筛选条件: ${JSON.stringify(filters, null, 2)}` : '无筛选条件'}
        
        注意：
        忽略订单状态为"已退款"和"意向中"的学员。
        一个单位可以即是机构，又是渠道。
        渠道为招生端，收取了学员学费为实收金额，招生收益是招生端的实际收益。
        实收金额减去招生收益是机构收益，是机构交付服务的收益。
        渠道费实际是给洽谈课程方的，正数是应付给新青年的费用，负数是新青年付给机构的洽谈费，这个和机构收益（交付的收益）是两个端口，应该分开统计。

        请提供以下分析:
        1. 计算机构收益，应转给不同机构的金额，附录不同机构涉及的报名学员详情；先分析完一个机构，再分析下一个机构。
        2. 计算渠道费，只涉及新青年和机构之间的资金流转，正数是机构应付给新青年的费用，负数是新青年付给机构的费用；附录不同机构涉及的报名学员详情；先分析完一个机构，再分析下一个机构。
        3. 新青年的收益，分为三部分，一部分是招生收益，渠道为"新青年"或"-"，没有这两种渠道，就为0。一部分是渠道费，就是涉及学员渠道费的加和。一部分是机构为"麦兜自营"的课程的机构收益，最后进行汇总。
        
        机构收益示例：
        - 机构：新趣
        - 机构收益计算：
        - 实收金额总和：对于状态不为"已退款"和"意向中"的学员，实收金额分别为600（学员2）、600（学员4）、600（学员5）、600（学员7）、600（学员8）、500（学员9），总和为 \(600\times5 + 500=3500\)。
        - 招生收益总和：每个学员招生收益都是240，共6个学员（学员2、4、5、7、8、9），总和为 \(240\times6 = 1440\)。
        机构收益 = 实收金额总和 - 招生收益总和 = \(3500 - 1440=2060\)。
        - 涉及报名学员详情：
        - 学员2：微信名2，课程名滑板 - 多区域可选，渠道本地宝，状态已支付，金额600，招生收益240。
        - 学员4：微信名4，课程名滑板 - 多区域可选，渠道 - ，状态已开班，金额600，招生收益240。
        - 学员5：微信名5，课程名滑板 - 多区域可选，渠道 - ，状态已支付，金额600，招生收益240。
        - 学员7：微信名7，课程名滑板 - 多区域可选，渠道 - ，状态已支付，金额600，招生收益240。
        - 学员8：微信名8，课程名滑板 - 多区域可选，渠道 - ，状态已支付，金额600，招生收益240。
        - 学员9：微信名9，课程名滑板 - 多区域可选，渠道本地宝，状态已支付，金额500，招生收益240。
        
        渠道费示例：
        - 渠道"本地宝"：
        - 学员2：渠道成本36
        - 学员3：渠道成本36
        - 学员6：渠道成本36
        - 学员9：渠道成本36
        渠道"本地宝"总金额 = 36×4 = 144
        - 涉及报名学员详情：
        - 学员2：微信名2，课程名滑板 - 多区域可选，渠道本地宝，状态已支付，金额600，招生收益240。
        - 学员3：微信名3，课程名滑板 - 多区域可选，渠道本地宝，状态已支付，金额600，招生收益240。
        - 学员6：微信名6，课程名滑板 - 多区域可选，渠道本地宝，状态已支付，金额600，招生收益240。
        - 学员9：微信名9，课程名滑板 - 多区域可选，渠道本地宝，状态已支付，金额500，招生收益240。
        `;

        console.log('AI分析请求提示词:', prompt);
        
        const modelId = process.env.ARK_ENDPOINT_ID || 'doubao-1.5-thinking-pro';
        console.log('使用的AI模型:', modelId);
        console.log('使用的API密钥:', process.env.ARK_API_KEY ? '已设置' : '未设置');
        
        // 调用火山方舟AI模型
        try {
            console.log('开始调用AI模型...');
            const response = await openai.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: '你是一位专业的会议师，擅长计算收入支出。' 
                    },
                    { 
                        role: 'user', 
                        content: [
                            {
                                type: 'text',
                                text: prompt
                            }
                        ]
                    }
                ],
                model: modelId,
                temperature: 0.7,
                max_tokens: 2000,
            });
                    
            
            console.log('AI模型调用成功，获得响应');
            
            // 记录操作
            await logOperation(
                '收益AI分析', 
                `用户${req.session.user.username}使用AI分析了收益数据，筛选条件: ${JSON.stringify(filters)}`, 
                req.session.user.username
            );
            
            // 返回AI分析结果
            res.json({
                success: true,
                analysis: response.choices[0].message.content
            });
        } catch (apiError) {
            console.error('调用AI API失败:', apiError);
            console.error('错误详情:', JSON.stringify(apiError, null, 2));
            
            if (apiError.response) {
                console.error('API响应状态:', apiError.response.status);
                console.error('API响应数据:', apiError.response.data);
            }
            
            throw new Error(`AI API调用失败: ${apiError.message}`);
        }
    } catch (error) {
        console.error('AI分析失败:', error);
        console.error('错误堆栈:', error.stack);
        res.status(500).json({
            success: false,
            error: '分析失败: ' + error.message
        });
    }
});

// AI营销内容生成接口
app.post('/api/generate-marketing', requireAuth, async (req, res) => {
    try {
        // 从请求中获取课程数据
        const { courses, style, audience, model } = req.body;
        
        console.log('收到AI营销请求，请求数据大小:', JSON.stringify(req.body).length);
        
        if (!courses || !Array.isArray(courses) || courses.length === 0) {
            return res.status(400).json({ success: false, error: '课程数据不能为空' });
        }
        
        // 准备提交给AI模型的提示词
        const prompt = `
        请为以下夜校课程创建一篇小红书风格的宣传文章。
        
        课程详情:
        ${courses.map(course => `
        课程名称: ${course.courseName}
        价格: ${course.price}元
        上课时间: ${course.class_time || '可咨询客服'}
        上课地点: ${course.location || '杭州市内'}
        所在区域: ${course.area || '多区域可选'}
        开课人数: ${course.min_students || '无限制'}-${course.max_students || '无限制'}人
        机构: ${course.institution || '杭州新青年夜校'}
        已报名学员: ${course.students ? course.students.length : 0}人
        `).join('\n')}
        
        风格要求: ${style || '轻松生活'}
        目标受众: ${audience || '通用人群'}
        
        注意事项:
        1. 创建一个吸引人的标题，字数在15-25字之间。
        2. 正文内容需要符合小红书的风格，包括:
           - 使用轻松活泼的语言
           - 使用表情符号增加亲和力
           - 包含个人感受和真实体验
           - 强调课程的特色和优势
           - 添加一些悬念或引人好奇的表述
        3. 文章结构应包括:
           - 吸引人的开场白
           - 课程介绍和特色描述
           - 适合人群
           - 价格和优惠信息
           - 体验感受或预期收获
           - 号召行动
        4. 生成5-8个适合该课程的小红书标签，每个标签不超过6个字。
        5. 总字数控制在600字以内。
        
        请以JSON格式返回结果，包含以下字段:
        {
            "title": "小红书标题",
            "content": "正文内容",
            "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"]
        }
        
        只输出JSON内容，不要有其他任何内容。确保JSON格式正确有效。
        `;
        
        console.log('AI营销请求提示词:', prompt);
        
        // 使用传入的模型ID，如果未提供则使用默认模型
        const modelId = model || 'deepseek-r1-250120';
        console.log('使用的AI模型:', modelId);
        
        // 调用火山方舟AI模型
        try {
            console.log('开始调用AI模型...');
            const response = await openai.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: '你是一位擅长内容创作的社交媒体营销专家。擅长使用表情符号增加内容亲和力，文风活泼吸引人。' 
                    },
                    { 
                        role: 'user', 
                        content: [
                            {
                                type: 'text',
                                text: prompt
                            }
                        ]
                    }
                ],
                model: modelId,
                temperature: 0.8,
                max_tokens: 2000,
                response_format: { type: "json_object" }
            });
            console.log(response);
            console.log('AI模型调用成功，获得响应');
            
            // 处理AI响应
            let aiResponse;
            try {
                // 尝试解析JSON响应
                const responseContent = response.choices[0].message.content;
                aiResponse = JSON.parse(responseContent);
                
                // 验证返回格式
                if (!aiResponse.title || !aiResponse.content || !aiResponse.tags) {
                    throw new Error('返回数据格式不完整');
                }
            } catch (parseError) {
                console.error('解析AI响应失败:', parseError);
                // 如果JSON解析失败，尝试从原始文本中提取内容
                const rawContent = response.choices[0].message.content;
                
                // 提取标题
                const titleMatch = rawContent.match(/["']title["']\s*:\s*["'](.+?)["']/);
                const title = titleMatch ? titleMatch[1] : '杭州夜校课程推荐';
                
                // 提取内容
                const contentMatch = rawContent.match(/["']content["']\s*:\s*["'](.+?)["']/s);
                const content = contentMatch 
                    ? contentMatch[1].replace(/\\n/g, '\n').replace(/\\\"/g, '"') 
                    : '请联系我们了解更多课程信息！';
                
                // 提取标签
                const tagsText = rawContent.match(/["']tags["']\s*:\s*\[(.*?)\]/s);
                const tags = tagsText 
                    ? tagsText[1].split(',').map(tag => tag.trim().replace(/["']/g, '')) 
                    : ['杭州夜校', '兴趣培训', '成人教育', '技能提升', '课程推荐'];
                
                aiResponse = { title, content, tags };
            }
            
            // 记录操作
            await logOperation(
                '生成营销内容', 
                `用户${req.session.user.username}使用AI生成了小红书营销内容，风格: ${style}, 目标人群: ${audience}`, 
                req.session.user.username
            );
            
            // 返回AI生成结果
            res.json({
                success: true,
                title: aiResponse.title,
                content: aiResponse.content,
                tags: aiResponse.tags
            });
        } catch (apiError) {
            console.error('调用AI API失败:', apiError);
            console.error('错误详情:', JSON.stringify(apiError, null, 2));
            
            if (apiError.response) {
                console.error('API响应状态:', apiError.response.status);
                console.error('API响应数据:', apiError.response.data);
            }
            
            throw new Error(`AI API调用失败: ${apiError.message}`);
        }
    } catch (error) {
        console.error('AI营销内容生成失败:', error);
        console.error('错误堆栈:', error.stack);
        res.status(500).json({
            success: false,
            error: '生成失败: ' + error.message
        });
    }
});

// 加入班级API
app.post('/api/classes/join', requireAuth, async (req, res) => {
    try {
        console.log('【API】收到加入班级请求');
        const { classId, students } = req.body;
        console.log('- classId:', classId);
        console.log('- students:', students);

        // 验证必要字段
        if (!classId || !students || !Array.isArray(students) || students.length === 0) {
            console.log('【API】缺少必要信息');
            return res.status(400).json({ success: false, message: '缺少必要信息' });
        }

        // 读取班级数据
        if (!fs.existsSync('classes.json')) {
            console.log('【API】classes.json不存在');
            return res.status(404).json({ success: false, message: '找不到班级数据' });
        }

        // 读取并解析班级数据
        const classesData = fs.readFileSync('classes.json', 'utf8');
        const classes = JSON.parse(classesData);
        console.log('【API】成功读取班级数据');

        // 查找指定班级
        const classIndex = classes.findIndex(c => c.id === classId);
        if (classIndex === -1) {
            console.log('【API】找不到指定班级:', classId);
            return res.status(404).json({ success: false, message: '找不到指定班级' });
        }
        console.log('【API】找到班级:', classes[classIndex]);

        // 更新学员状态和班级信息
        if (!fs.existsSync('students.json')) {
            fs.writeFileSync('students.json', '[]', 'utf8');
        }
        const studentsData = fs.readFileSync('students.json', 'utf8');
        let allStudents = JSON.parse(studentsData);

        // 获取要更新的学员ID列表
        const studentIds = students.map(s => s.id);
        const now = new Date().toISOString();

        // 更新学员状态和班级信息
        allStudents = allStudents.map(student => {
            if (studentIds.includes(student.id)) {
                return {
                    ...student,
                    status: '已开班',
                    classStartDate: classes[classIndex].startTime, // 使用班级的开始时间
                    classId: classId,
                    className: classes[classIndex].className,
                    updatedAt: now
                };
            }
            return student;
        });

        // 更新班级的学员列表
        classes[classIndex].students = classes[classIndex].students || [];
        classes[classIndex].students.push(...studentIds);

        // 保存更新后的数据
        fs.writeFileSync('classes.json', JSON.stringify(classes, null, 2));
        fs.writeFileSync('students.json', JSON.stringify(allStudents, null, 2));

        // 记录操作日志
        await logOperation(
            '加入班级',
            `将${students.length}名学员加入班级${classes[classIndex].className}`,
            req.session.user.username
        );

        console.log('【API】加入班级成功');
        res.json({ success: true, message: '加入班级成功' });
    } catch (error) {
        console.error('【API】加入班级失败:', error);
        res.status(500).json({ success: false, message: '加入班级失败' });
    }
});

// 静态文件服务 - 放在API路由之后
app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 