const express = require('express');
const path = require('path');
const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fsPromises = require('fs').promises;

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

// 更新学员信息
app.post('/api/students/update', requireAuth, async (req, res) => {
    console.log('收到更新学员请求:', req.body);
    
    try {
        const { courseId, studentIndex, student } = req.body;
        
        // 验证必要字段
        if (!courseId || studentIndex === null || !student) {
            throw new Error('缺少必要参数');
        }
        
        // 读取现有数据
        const data = fs.readFileSync('students.json', 'utf8');
        const students = JSON.parse(data);
        
        // 查找并更新学员信息
        const courseStudents = students.filter(s => s.courseId === courseId);
        if (studentIndex >= courseStudents.length) {
            throw new Error('学员索引无效');
        }
        
        // 找到要更新的学员在整个数组中的索引
        const globalIndex = students.findIndex(s => 
            s.courseId === courseId && 
            s.wechatName === courseStudents[studentIndex].wechatName &&
            s.addedAt === courseStudents[studentIndex].addedAt
        );
        
        if (globalIndex === -1) {
            throw new Error('未找到要更新的学员');
        }
        
        // 记录变更内容
        const oldStudent = students[globalIndex];
        const changes = [];
        
        if (oldStudent.wechatName !== student.wechatName) {
            changes.push(`微信名: ${oldStudent.wechatName} → ${student.wechatName}`);
        }
        
        if (oldStudent.amount !== student.amount) {
            changes.push(`金额: ¥${oldStudent.amount} → ¥${student.amount}`);
        }
        
        if (oldStudent.channel !== student.channel) {
            changes.push(`渠道: ${oldStudent.channel || '无'} → ${student.channel || '无'}`);
        }
        
        if (oldStudent.status !== student.status) {
            changes.push(`状态: ${oldStudent.status} → ${student.status}`);
        }
        
        if (oldStudent.preferredTime !== student.preferredTime) {
            changes.push(`意向上课时间: ${oldStudent.preferredTime || '无'} → ${student.preferredTime || '无'}`);
        }
        
        // 保留原有的添加人和添加时间
        const updatedStudent = {
            ...student,
            courseId,
            addedBy: students[globalIndex].addedBy,
            addedAt: students[globalIndex].addedAt
        };
        
        // 更新数据
        students[globalIndex] = updatedStudent;
        
        // 保存到文件
        fs.writeFileSync('students.json', JSON.stringify(students, null, 2));
        
        await logOperation(
            '更新学员信息',
            `课程: ${updatedStudent.courseName || courseId}, 学员: ${student.wechatName}, 变更: ${changes.join(', ')}`,
            req.session.user.username
        );
        
        res.json({ success: true, message: '更新成功' });
        
    } catch (error) {
        console.error('更新学员信息失败:', error);
        res.status(500).json({ success: false, message: error.message });
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

// 开课API
app.post('/api/classes/create', requireAuth, async (req, res) => {
    try {
        console.log('收到开课请求');
        console.log('会话信息:', req.session);
        console.log('用户信息:', req.session.user);
        console.log('请求体:', req.body);

        const { startTime, duration, location, students } = req.body;

        // 验证必要字段
        if (!startTime || !duration || !location || !students || !students.length) {
            return res.status(400).json({ success: false, message: '缺少必要信息' });
        }

        // 读取现有课程数据
        let classes = [];
        try {
            const classesData = await fs.promises.readFile(classesFilePath, 'utf8');
            classes = JSON.parse(classesData);
        } catch (error) {
            console.error('读取课程数据失败:', error);
            classes = [];
        }

        // 创建新课程
        const newClass = {
            id: `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            startTime,
            duration,
            location,
            students,
            createdBy: req.session.user.username,
            createdAt: new Date().toISOString()
        };

        // 添加新课程
        classes.push(newClass);

        // 保存数据
        await fs.promises.writeFile(classesFilePath, JSON.stringify(classes, null, 2), 'utf8');

        // 记录操作日志
        await logOperation(req.session.user.username, '创建课程', 
            `课程: ${students[0].courseName}, 开课时间: ${new Date(startTime).toLocaleString('zh-CN')}, 学员数: ${students.length}`);

        res.json({ success: true, message: '开课成功', class: newClass });
    } catch (error) {
        console.error('创建课程失败:', error);
        res.status(500).json({ success: false, message: '创建课程失败' });
    }
});

// 获取课程列表API
app.get('/api/classes', requireAuth, async (req, res) => {
    try {
        // 读取课程数据
        const classesData = await fs.promises.readFile(classesFilePath, 'utf8');
        const classes = JSON.parse(classesData);
        res.json(classes);
    } catch (error) {
        console.error('获取课程列表失败:', error);
        res.status(500).json({ success: false, message: '获取课程列表失败' });
    }
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 