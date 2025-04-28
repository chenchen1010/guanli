const fs = require('fs');
const path = require('path');

async function fixStudents() {
    try {
        const studentsPath = path.join(__dirname, 'students.json');
        
        // 检查学员数据文件是否存在
        if (!fs.existsSync(studentsPath)) {
            console.log('学员数据文件不存在');
            return;
        }
        
        // 读取现有学员数据
        const content = fs.readFileSync(studentsPath, 'utf8');
        let students = JSON.parse(content);
        console.log(`共读取 ${students.length} 条学员记录`);
        
        // 更新学员数据，确保每个记录都有preferredTime字段
        let updatedCount = 0;
        students = students.map(student => {
            if (!student.hasOwnProperty('preferredTime')) {
                student.preferredTime = '';
                updatedCount++;
            }
            return student;
        });
        
        // 将修复后的数据写回文件
        fs.writeFileSync(studentsPath, JSON.stringify(students, null, 2), 'utf8');
        console.log(`成功更新 ${updatedCount} 条学员记录，添加了preferredTime字段`);
    } catch (error) {
        console.error('修复学员数据失败:', error);
    }
}

fixStudents().then(() => {
    console.log('学员数据修复完成');
}).catch(err => {
    console.error('学员数据修复过程中出错:', err);
}); 