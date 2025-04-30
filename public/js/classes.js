// 全局变量
let currentDate = new Date();
let classes = [];

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    utils.checkLoginStatus();
    utils.restoreSidebarState();
    fetchClasses();
    renderCalendar();
});

// 获取课程数据
function fetchClasses() {
    fetch('/api/classes')
        .then(response => response.json())
        .then(data => {
            classes = data;
            renderCalendar();
        })
        .catch(error => console.error('获取课程数据失败:', error));
}

// 渲染日历
function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // 更新日历标题
    document.getElementById('calendarTitle').textContent = `${year}年${month + 1}月`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const calendarGrid = document.getElementById('calendarGrid');
    calendarGrid.innerHTML = '';

    // 添加星期头部
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    weekdays.forEach(day => {
        const weekdayElement = document.createElement('div');
        weekdayElement.className = 'calendar-weekday';
        weekdayElement.textContent = day;
        calendarGrid.appendChild(weekdayElement);
    });

    // 添加上个月的天数
    const prevMonth = new Date(year, month - 1, 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
        const dayElement = createDayElement(prevMonthDays - i, true);
        calendarGrid.appendChild(dayElement);
    }

    // 添加当前月的天数
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = createDayElement(day, false);
        
        // 添加当天的课程
        const dayClasses = getClassesForDay(year, month, day);
        dayClasses.forEach(classItem => {
            const classElement = document.createElement('div');
            classElement.className = 'class-item';
            classElement.textContent = `${classItem.courseName} (${classItem.students.length}人)`;
            classElement.onclick = () => showClassDetail(classItem);
            dayElement.appendChild(classElement);
        });

        calendarGrid.appendChild(dayElement);
    }

    // 添加下个月的天数
    const remainingDays = 42 - (startingDay + daysInMonth); // 保持6行
    for (let day = 1; day <= remainingDays; day++) {
        const dayElement = createDayElement(day, true);
        calendarGrid.appendChild(dayElement);
    }
}

// 创建日期元素
function createDayElement(day, isOtherMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = `calendar-day${isOtherMonth ? ' other-month' : ''}`;
    dayElement.innerHTML = `<div class="calendar-day-header">${day}</div>`;
    return dayElement;
}

// 获取指定日期的课程
function getClassesForDay(year, month, day) {
    const date = new Date(year, month, day);
    return classes.filter(classItem => {
        const classDate = new Date(classItem.startTime);
        return classDate.getDate() === day && 
               classDate.getMonth() === month && 
               classDate.getFullYear() === year;
    });
}

// 显示课程详情
function showClassDetail(classItem) {
    const modal = document.getElementById('classDetailModal');
    const title = document.getElementById('classDetailTitle');
    const info = document.getElementById('classDetailInfo');
    const students = document.getElementById('classDetailStudents');

    title.textContent = classItem.courseName;
    info.innerHTML = `
        <p>开课时间：${utils.formatDate(classItem.startTime)}</p>
        <p>持续周数：${classItem.duration}周</p>
        <p>上课地点：${classItem.location}</p>
        <p>学员数量：${classItem.students.length}人</p>
    `;

    students.innerHTML = classItem.students.map(student => `
        <div class="student-list-item">
            <span>${student.name}</span>
            <span>${student.status}</span>
        </div>
    `).join('');

    modal.style.display = 'block';
}

// 关闭课程详情
function closeClassDetail() {
    document.getElementById('classDetailModal').style.display = 'none';
}

// 切换到上个月
function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

// 切换到下个月
function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
} 