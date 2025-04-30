// 检查登录状态
function checkLoginStatus() {
    return fetch('/api/check-login')
        .then(response => response.json())
        .then(data => {
            if (!data.isLoggedIn) {
                window.location.href = '/login.html';
                return false;
            }
            return true;
        })
        .catch(error => {
            console.error('检查登录状态失败:', error);
            window.location.href = '/login.html';
            return false;
        });
}

// 格式化日期
function formatDate(date) {
    return new Date(date).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 格式化金额
function formatAmount(amount) {
    return `¥${parseFloat(amount).toFixed(2)}`;
}

// 显示提示消息
function showMessage(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// 确认对话框
function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-body">${message}</div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove(); return false;">取消</button>
                    <button class="btn" onclick="this.closest('.modal').remove(); return true;">确认</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.style.display = 'block';
        
        const buttons = modal.querySelectorAll('button');
        buttons[0].onclick = () => {
            modal.remove();
            resolve(false);
        };
        buttons[1].onclick = () => {
            modal.remove();
            resolve(true);
        };
    });
}

// 侧边栏切换
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
    
    localStorage.setItem('sidebarCollapsed', !isCollapsed);
}

// 恢复侧边栏状态
function restoreSidebarState() {
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('expanded');
    }
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 节流函数
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 导出工具函数
window.utils = {
    checkLoginStatus,
    formatDate,
    formatAmount,
    showMessage,
    showConfirm,
    toggleSidebar,
    restoreSidebarState,
    debounce,
    throttle
}; 