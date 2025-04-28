const fs = require('fs');
const path = require('path');

async function fixLogs() {
    try {
        const logPath = path.join(__dirname, 'operations.log');
        
        // 检查日志文件是否存在
        if (!fs.existsSync(logPath)) {
            console.log('日志文件不存在，创建空日志文件');
            fs.writeFileSync(logPath, '[]', 'utf8');
            return;
        }
        
        // 读取现有日志文件
        const content = fs.readFileSync(logPath, 'utf8');
        
        // 尝试直接解析为JSON数组
        try {
            const logs = JSON.parse(content);
            if (Array.isArray(logs)) {
                console.log('日志文件已经是JSON数组格式，无需修复');
                return;
            }
        } catch (e) {
            // 不是有效的JSON，继续修复
        }
        
        // 处理每行为单独JSON的情况
        const lines = content.trim().split('\n').filter(line => line.trim());
        const logs = [];
        
        for (const line of lines) {
            try {
                // 处理可能的格式问题
                const cleanLine = line.replace(/^\[\]\s*/, '');
                if (!cleanLine) continue;
                
                const log = JSON.parse(cleanLine);
                logs.push(log);
                console.log('成功解析日志:', log);
            } catch (error) {
                console.error('无法解析日志行:', line);
            }
        }
        
        // 将修复后的日志写回文件
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8');
        console.log(`成功修复 ${logs.length} 条日志记录`);
    } catch (error) {
        console.error('修复日志文件失败:', error);
    }
}

fixLogs().then(() => {
    console.log('日志修复完成');
}).catch(err => {
    console.error('日志修复过程中出错:', err);
}); 