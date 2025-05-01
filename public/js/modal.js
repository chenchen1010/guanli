class Modal {
    constructor(id) {
        this.modal = document.getElementById(id);
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 关闭按钮点击事件
        const closeButtons = this.modal.querySelectorAll('.close-modal');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => this.hide());
        });

        // 点击模态框外部关闭
        window.addEventListener('click', (event) => {
            if (event.target === this.modal) {
                this.hide();
            }
        });
    }

    show() {
        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    hide() {
        this.modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    setContent(content) {
        const contentContainer = this.modal.querySelector('.modal-content');
        if (contentContainer) {
            contentContainer.innerHTML = content;
        }
    }
}

// 导出Modal类
export default Modal; 