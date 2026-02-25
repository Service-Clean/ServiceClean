// Конфигурация Supabase
const supabaseUrl = 'https://pyojgyasaccwrcdogexx.supabase.co';
const supabaseKey = 'sb_publishable_db9nx0GejLB8Cw7XNB3ACg_FmTeP-WX';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Состояние приложения
let currentUser = null;
let employees = [];
let orders = [];
let charts = {};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    checkSession();
    setupEventListeners();
});

// Инициализация базы данных
async function initDatabase() {
    try {
        // Проверяем наличие демо-пользователя
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('email', 'admin@serviceclean.ru')
            .single();

        if (!existingUser) {
            await supabase
                .from('users')
                .insert([{
                    email: 'admin@serviceclean.ru',
                    password: 'admin123',
                    name: 'Администратор'
                }]);
        }
    } catch (error) {
        console.error('Ошибка инициализации:', error);
    }
}

// Проверка сессии
async function checkSession() {
    const savedSession = localStorage.getItem('serviceclean_session');
    
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            currentUser = session.user;
            
            // Обновляем информацию о пользователе
            document.getElementById('user-name').textContent = currentUser.name || 'Администратор';
            document.getElementById('user-email').textContent = currentUser.email;
            
            showMainApp();
            await loadData();
        } catch (error) {
            console.error('Ошибка загрузки сессии:', error);
            localStorage.removeItem('serviceclean_session');
        }
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Авторизация
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // Выход
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Навигация
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(item.dataset.tab);
        });
    });
    
    // Кнопки добавления
    document.getElementById('add-employee-btn').addEventListener('click', () => openModal('employee'));
    document.getElementById('add-order-btn').addEventListener('click', () => openModal('order'));
    
    // Формы
    document.getElementById('employee-form').addEventListener('submit', handleEmployeeSubmit);
    document.getElementById('order-form').addEventListener('submit', handleOrderSubmit);
    
    // Фильтры
    document.getElementById('order-status-filter').addEventListener('change', filterOrders);
    document.getElementById('order-employee-filter').addEventListener('change', filterOrders);
    
    // Отчёты
    document.getElementById('generate-pdf-btn').addEventListener('click', generatePDF);
    document.getElementById('show-qr-btn').addEventListener('click', () => openModal('qr'));
    document.getElementById('download-qr-btn').addEventListener('click', downloadQR);
    
    // Закрытие модальных окон
    document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => closeAllModals());
    });
    
    // Клик вне модального окна
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeAllModals();
        }
    });
}

// Обработка входа
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single();
        
        if (error || !user) {
            showNotification('Неверный email или пароль', 'error');
            return;
        }
        
        currentUser = user;
        localStorage.setItem('serviceclean_session', JSON.stringify({
            user: user,
            timestamp: new Date().getTime()
        }));
        
        document.getElementById('user-name').textContent = user.name || 'Администратор';
        document.getElementById('user-email').textContent = user.email;
        
        showMainApp();
        await loadData();
        showNotification('Успешный вход!', 'success');
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        showNotification('Ошибка при входе', 'error');
    }
}

// Выход
function handleLogout() {
    currentUser = null;
    localStorage.removeItem('serviceclean_session');
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

// Переключение экранов
function showMainApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
}

// Переключение вкладок
function switchTab(tabName) {
    // Обновляем активный пункт меню
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Обновляем активный контент
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Обновляем данные для конкретных вкладок
    if (tabName === 'dashboard') {
        updateDashboard();
    } else if (tabName === 'reports') {
        updateReports();
    }
}

// Загрузка данных
async function loadData() {
    try {
        await Promise.all([loadEmployees(), loadOrders()]);
        updateDashboard();
        updateFilters();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

// Загрузка сотрудников
async function loadEmployees() {
    try {
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        employees = data || [];
        displayEmployees();
        updateEmployeeSelect();
        
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        employees = [];
    }
}

// Загрузка заказов
async function loadOrders() {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                employees (
                    id,
                    name,
                    position
                )
            `)
            .order('date', { ascending: false });
        
        if (error) throw error;
        
        orders = data || [];
        displayOrders();
        
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
        orders = [];
    }
}

// Отображение сотрудников
function displayEmployees() {
    const tbody = document.getElementById('employees-list');
    
    if (!employees.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Нет данных</td></tr>';
        return;
    }
    
    tbody.innerHTML = employees.map(emp => {
        const employeeOrders = orders.filter(o => o.employee_id === emp.id);
        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="user-avatar" style="width: 40px; height: 40px;">
                            <i class="fas fa-user-circle"></i>
                        </div>
                        <div>
                            <div style="font-weight: 500;">${emp.name || '—'}</div>
                            <div style="font-size: 12px; color: var(--secondary);">ID: ${emp.id}</div>
                        </div>
                    </div>
                </td>
                <td>${emp.position || '—'}</td>
                <td>
                    <div>${emp.phone || '—'}</div>
                    <div style="font-size: 12px; color: var(--secondary);">${emp.email || '—'}</div>
                </td>
                <td>${emp.hire_date ? new Date(emp.hire_date).toLocaleDateString('ru-RU') : '—'}</td>
                <td>
                    <span style="font-weight: 600; color: var(--primary);">${employeeOrders.length}</span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn edit-btn" onclick="editEmployee(${emp.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteEmployee(${emp.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Отображение заказов
function displayOrders(filteredOrders = orders) {
    const tbody = document.getElementById('orders-list');
    
    if (!filteredOrders.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Нет данных</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredOrders.map(order => {
        const statusClass = order.status === 'Выполнен' ? 'completed' : 'in-progress';
        const statusText = order.status === 'Выполнен' ? 'Выполнен' : 'В процессе';
        
        return `
            <tr>
                <td>
                    <div style="font-weight: 500;">${order.client || '—'}</div>
                </td>
                <td>${order.service || '—'}</td>
                <td>
                    ${order.employees ? 
                        `<div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-user" style="color: var(--primary);"></i>
                            ${order.employees.name}
                        </div>` : 
                        '—'
                    }
                </td>
                <td>${order.date ? new Date(order.date).toLocaleString('ru-RU') : '—'}</td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td><span style="font-weight: 600;">${order.amount?.toLocaleString() || 0} ₽</span></td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn edit-btn" onclick="editOrder(${order.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteOrder(${order.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Фильтрация заказов
function filterOrders() {
    const statusFilter = document.getElementById('order-status-filter').value;
    const employeeFilter = document.getElementById('order-employee-filter').value;
    
    let filtered = [...orders];
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(o => o.status === statusFilter);
    }
    
    if (employeeFilter !== 'all') {
        filtered = filtered.filter(o => o.employee_id == employeeFilter);
    }
    
    displayOrders(filtered);
}

// Обновление фильтров
function updateFilters() {
    const employeeFilter = document.getElementById('order-employee-filter');
    employeeFilter.innerHTML = '<option value="all">Все сотрудники</option>' + 
        employees.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
}

// Обновление выпадающего списка сотрудников в форме
function updateEmployeeSelect() {
    const select = document.getElementById('order-employee');
    select.innerHTML = '<option value="">Выберите сотрудника</option>' + 
        employees.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
}

// Обновление дашборда
function updateDashboard() {
    // Обновляем статистику
    document.getElementById('stat-employees').textContent = employees.length;
    document.getElementById('stat-orders').textContent = orders.length;
    document.getElementById('stat-in-progress').textContent = orders.filter(o => o.status === 'В процессе').length;
    document.getElementById('stat-completed').textContent = orders.filter(o => o.status === 'Выполнен').length;
    
    // Обновляем график заказов
    updateOrdersChart();
    
    // Обновляем топ сотрудников
    updateTopEmployees();
}

// График заказов
function updateOrdersChart() {
    const ctx = document.getElementById('orders-chart').getContext('2d');
    
    // Группируем заказы по датам
    const last7Days = [];
    const ordersCount = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const count = orders.filter(o => {
            const orderDate = new Date(o.date);
            return orderDate >= date && orderDate < nextDate;
        }).length;
        
        last7Days.push(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
        ordersCount.push(count);
    }
    
    if (charts.orders) {
        charts.orders.destroy();
    }
    
    charts.orders = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last7Days,
            datasets: [{
                label: 'Заказов',
                data: ordersCount,
                borderColor: '#4361ee',
                backgroundColor: 'rgba(67, 97, 238, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Топ сотрудников
function updateTopEmployees() {
    const container = document.getElementById('top-employees');
    
    const employeeStats = employees.map(emp => {
        const employeeOrders = orders.filter(o => o.employee_id === emp.id);
        const completed = employeeOrders.filter(o => o.status === 'Выполнен').length;
        return {
            name: emp.name,
            total: employeeOrders.length,
            completed
        };
    })
    .filter(stat => stat.total > 0)
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5);
    
    if (!employeeStats.length) {
        container.innerHTML = '<p class="text-muted">Нет данных</p>';
        return;
    }
    
    container.innerHTML = employeeStats.map((stat, index) => `
        <div class="employee-rank">
            <div class="rank-number">${index + 1}</div>
            <div class="rank-info">
                <span class="rank-name">${stat.name}</span>
                <span class="rank-stats">Выполнено заказов: ${stat.completed}</span>
            </div>
            <div class="rank-value">${stat.completed}</div>
        </div>
    `).join('');
}

// Обновление отчётов
function updateReports() {
    const statusCtx = document.getElementById('status-chart').getContext('2d');
    const employeesCtx = document.getElementById('employees-chart').getContext('2d');
    
    // Статусы заказов
    const completed = orders.filter(o => o.status === 'Выполнен').length;
    const inProgress = orders.filter(o => o.status === 'В процессе').length;
    
    if (charts.status) {
        charts.status.destroy();
    }
    
    charts.status = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Выполнено', 'В процессе'],
            datasets: [{
                data: [completed, inProgress],
                backgroundColor: ['#22c55e', '#f59e0b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
    
    // Заказы по сотрудникам
    const employeeNames = employees.map(e => e.name);
    const employeeOrders = employees.map(e => 
        orders.filter(o => o.employee_id === e.id).length
    );
    
    if (charts.employees) {
        charts.employees.destroy();
    }
    
    charts.employees = new Chart(employeesCtx, {
        type: 'bar',
        data: {
            labels: employeeNames,
            datasets: [{
                label: 'Количество заказов',
                data: employeeOrders,
                backgroundColor: '#4361ee',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Работа с модальными окнами
function openModal(type, id = null) {
    closeAllModals();
    
    const modal = document.getElementById(`${type}-modal`);
    if (!modal) return;
    
    if (type === 'qr') {
        generateQRCode();
    } else if (type === 'employee' && id) {
        fillEmployeeForm(id);
    } else if (type === 'order' && id) {
        fillOrderForm(id);
    } else {
        // Очищаем формы для нового элемента
        document.getElementById(`${type}-form`).reset();
        document.getElementById(`${type}-id`).value = '';
        document.getElementById(`${type}-modal-title`).textContent = 
            type === 'employee' ? 'Добавить сотрудника' : 'Создать заказ';
    }
    
    modal.classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Заполнение формы сотрудника
function fillEmployeeForm(id) {
    const employee = employees.find(e => e.id == id);
    if (!employee) return;
    
    document.getElementById('employee-modal-title').textContent = 'Редактировать сотрудника';
    document.getElementById('employee-id').value = employee.id;
    document.getElementById('employee-name').value = employee.name || '';
    document.getElementById('employee-position').value = employee.position || '';
    document.getElementById('employee-phone').value = employee.phone || '';
    document.getElementById('employee-email').value = employee.email || '';
    document.getElementById('employee-hire-date').value = employee.hire_date || '';
}

// Заполнение формы заказа
function fillOrderForm(id) {
    const order = orders.find(o => o.id == id);
    if (!order) return;
    
    document.getElementById('order-modal-title').textContent = 'Редактировать заказ';
    document.getElementById('order-id').value = order.id;
    document.getElementById('order-client').value = order.client || '';
    document.getElementById('order-service').value = order.service || '';
    document.getElementById('order-employee').value = order.employee_id || '';
    document.getElementById('order-date').value = order.date ? order.date.slice(0, 16) : '';
    document.getElementById('order-status').value = order.status || 'В процессе';
    document.getElementById('order-amount').value = order.amount || '';
}

// Обработка формы сотрудника
async function handleEmployeeSubmit(e) {
    e.preventDefault();
    
    const employeeData = {
        name: document.getElementById('employee-name').value,
        position: document.getElementById('employee-position').value,
        phone: document.getElementById('employee-phone').value,
        email: document.getElementById('employee-email').value || null,
        hire_date: document.getElementById('employee-hire-date').value
    };
    
    const id = document.getElementById('employee-id').value;
    
    try {
        if (id) {
            const { error } = await supabase
                .from('employees')
                .update(employeeData)
                .eq('id', id);
            
            if (error) throw error;
            showNotification('Сотрудник обновлён', 'success');
        } else {
            const { error } = await supabase
                .from('employees')
                .insert([employeeData]);
            
            if (error) throw error;
            showNotification('Сотрудник добавлен', 'success');
        }
        
        closeAllModals();
        await loadEmployees();
        
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка сохранения', 'error');
    }
}

// Обработка формы заказа
async function handleOrderSubmit(e) {
    e.preventDefault();
    
    const orderData = {
        client: document.getElementById('order-client').value,
        service: document.getElementById('order-service').value,
        employee_id: document.getElementById('order-employee').value || null,
        date: document.getElementById('order-date').value,
        status: document.getElementById('order-status').value,
        amount: parseFloat(document.getElementById('order-amount').value)
    };
    
    const id = document.getElementById('order-id').value;
    
    try {
        if (id) {
            const { error } = await supabase
                .from('orders')
                .update(orderData)
                .eq('id', id);
            
            if (error) throw error;
            showNotification('Заказ обновлён', 'success');
        } else {
            const { error } = await supabase
                .from('orders')
                .insert([orderData]);
            
            if (error) throw error;
            showNotification('Заказ создан', 'success');
        }
        
        closeAllModals();
        await loadOrders();
        filterOrders();
        
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка сохранения', 'error');
    }
}

// Удаление сотрудника
window.deleteEmployee = async function(id) {
    if (!confirm('Вы уверены, что хотите удалить сотрудника?')) return;
    
    try {
        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showNotification('Сотрудник удалён', 'success');
        await loadEmployees();
        
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка удаления', 'error');
    }
};

// Удаление заказа
window.deleteOrder = async function(id) {
    if (!confirm('Вы уверены, что хотите удалить заказ?')) return;
    
    try {
        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showNotification('Заказ удалён', 'success');
        await loadOrders();
        filterOrders();
        
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка удаления', 'error');
    }
};

// Редактирование
window.editEmployee = function(id) {
    openModal('employee', id);
};

window.editOrder = function(id) {
    openModal('order', id);
};

// QR код
function generateQRCode() {
    const container = document.getElementById('qrcode');
    container.innerHTML = '';
    
    const url = window.location.href;
    new QRCode(container, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

function downloadQR() {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = 'serviceclean-qr.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// PDF отчёт
async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Заголовок
    doc.setFillColor(67, 97, 238);
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('ServiceClean', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Отчёт по деятельности', 105, 30, { align: 'center' });
    
    // Дата
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Сгенерировано: ${new Date().toLocaleString('ru-RU')}`, 14, 50);
    
    // Статистика
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Общая статистика', 14, 65);
    
    const completed = orders.filter(o => o.status === 'Выполнен').length;
    const inProgress = orders.filter(o => o.status === 'В процессе').length;
    const totalAmount = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Всего сотрудников: ${employees.length}`, 14, 75);
    doc.text(`Всего заказов: ${orders.length}`, 14, 82);
    doc.text(`Выполнено: ${completed}`, 14, 89);
    doc.text(`В процессе: ${inProgress}`, 14, 96);
    doc.text(`Общая выручка: ${totalAmount.toLocaleString()} ₽`, 14, 103);
    
    // Таблица заказов
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Последние заказы', 14, 118);
    
    const tableData = orders.slice(0, 10).map(order => [
        order.client || '-',
        order.service || '-',
        order.employees?.name || '-',
        order.date ? new Date(order.date).toLocaleDateString('ru-RU') : '-',
        order.status || '-',
        `${order.amount?.toLocaleString() || 0} ₽`
    ]);
    
    doc.autoTable({
        startY: 125,
        head: [['Клиент', 'Услуга', 'Сотрудник', 'Дата', 'Статус', 'Сумма']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
            fillColor: [67, 97, 238],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        styles: {
            fontSize: 9,
            cellPadding: 4
        }
    });
    
    doc.save('serviceclean-report.pdf');
}

// Уведомления
function showNotification(message, type = 'info') {
    // Создаём элемент уведомления
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Стили для уведомления
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Добавляем стили для анимаций
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
