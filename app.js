// ==================== STATE MANAGEMENT ====================
let state = {
    items: [],
    cart: [],
    currentPage: 'home',
    filteredItems: [],
    theme: localStorage.getItem('theme') || 'light'
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    applyTheme();
    loadItemsFromStorage();
    loadCartFromStorage();
    renderPage('home');
});

function initializeApp() {
    // Initialize items from localStorage or use seed items
    const savedItems = localStorage.getItem('ecommerceItems');
    state.items = savedItems ? JSON.parse(savedItems) : SEED_ITEMS;
    state.filteredItems = [...state.items];
    renderCarousel();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Navigation links
    document.querySelectorAll('.nav-link, [data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.getAttribute('data-page') || link.textContent.toLowerCase();
            renderPage(page);
        });
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Cart button
    document.getElementById('cart-btn').addEventListener('click', toggleCart);

    // Modal close buttons
    document.getElementById('close-cart-btn').addEventListener('click', toggleCart);
    document.getElementById('cart-overlay').addEventListener('click', () => {
        document.getElementById('cart-sidebar').classList.remove('open');
        document.getElementById('cart-overlay').classList.remove('active');
    });

    // Add item button
    document.getElementById('add-item-btn').addEventListener('click', () => {
        document.getElementById('add-items-modal').classList.add('active');
    });

    document.getElementById('close-add-form').addEventListener('click', () => {
        document.getElementById('add-items-modal').classList.remove('active');
    });

    // Add item form
    document.getElementById('add-item-form').addEventListener('submit', handleAddItem);

    // Contact form
    document.getElementById('contact-form').addEventListener('submit', handleContactSubmit);

    // Search and filter
    document.getElementById('search-input').addEventListener('input', filterItems);
    document.getElementById('category-filter').addEventListener('change', filterItems);

    // Checkout button
    document.getElementById('checkout-btn').addEventListener('click', handleCheckout);
}

// ==================== THEME MANAGEMENT ====================
function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', state.theme);
    applyTheme();
    updateThemeToggleButton();
}

function applyTheme() {
    if (state.theme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
    } else {
        document.body.removeAttribute('data-theme');
        document.documentElement.style.colorScheme = 'light';
    }
    updateThemeToggleButton();
}

function updateThemeToggleButton() {
    const btn = document.getElementById('theme-toggle');
    btn.textContent = state.theme === 'dark' ? '☀️' : '🌙';
}

// ==================== PAGE RENDERING ====================
function renderPage(page) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));
    
    const pageName = page === 'products' ? 'products-page' : `${page}-page`;
    const pageElement = document.getElementById(pageName);
    
    if (pageElement) {
        pageElement.classList.add('active');
        state.currentPage = page;
    }

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-page') === page) {
            link.classList.add('active');
        }
    });

    if (page === 'products') {
        renderProducts();
    }
}

// ==================== PRODUCTS PAGE ====================
function renderProducts() {
    const grid = document.getElementById('items-grid');
    
    if (state.filteredItems.length === 0) {
        grid.innerHTML = '<div class="no-items">No products found</div>';
        return;
    }

    grid.innerHTML = state.filteredItems.map(item => `
        <div class="item-card">
            <div class="item-image">
                ${item.picture ? `<img src="${item.picture}" alt="${item.name}" onerror="this.style.display='none'">` : ''}
                ${!item.picture ? `<div class="image-placeholder">No Image</div>` : ''}
            </div>
            <div class="product-info">
                <h3>${item.name}</h3>
                <span class="category">${item.category}</span>
                <p>${item.description}</p>
                <div class="product-footer">
                    <span class="product-price">$${item.price.toFixed(2)}</span>
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                    ${item.quantity > 0 ? `
                        <div class="product-quantity">
                            <input type="number" class="quantity-input" value="1" min="1" max="${item.quantity}">
                            <button class="add-to-cart-btn" onclick="addToCart(${item.id}, this)">Add</button>
                        </div>
                    ` : `
                        <button class="add-to-cart-btn" disabled>Out of Stock</button>
                    `}
                </div>
                ${item.quantity <= 0 ? `<div style="color: #ff4444; font-size: 0.85rem; margin-top: 0.5rem;">Out of Stock</div>` : `<div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem;">${item.quantity} in stock</div>`}
            </div>
            <button class="delete-btn" onclick="deleteProduct(${item.id})" title="Delete product">×</button>
        </div>
    `).join('');
}

function filterItems() {
    const searchText = document.getElementById('search-input').value.toLowerCase();
    const category = document.getElementById('category-filter').value;

    state.filteredItems = state.items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchText) || 
                            item.description.toLowerCase().includes(searchText);
        const matchesCategory = !category || item.category === category;
        return matchesSearch && matchesCategory;
    });

    renderProducts();
}

function addToCart(itemId, btn) {
    const quantityInput = btn.previousElementSibling;
    const quantity = parseInt(quantityInput.value) || 1;
    const item = state.items.find(i => i.id === itemId);

    if (!item || item.quantity < quantity) {
        showNotification('Not enough stock', 'error');
        return;
    }

    // Update product quantity
    item.quantity -= quantity;

    // Add to cart
    const existingCartItem = state.cart.find(ci => ci.id === itemId);
    if (existingCartItem) {
        existingCartItem.cartQuantity += quantity;
    } else {
        state.cart.push({ ...item, cartQuantity: quantity, originalQuantity: item.quantity });
    }

    saveItemsToStorage();
    saveCartToStorage();
    updateCartUI();
    showNotification(`Added ${quantity} ${item.name}(s) to cart`, 'success');
    renderProducts();
}

function deleteProduct(itemId) {
    if (confirm('Are you sure you want to delete this product?')) {
        state.items = state.items.filter(item => item.id !== itemId);
        state.filteredItems = state.filteredItems.filter(item => item.id !== itemId);
        saveItemsToStorage();
        renderProducts();
        showNotification('Product deleted', 'success');
    }
}

function handleAddItem(e) {
    e.preventDefault();
    
    const newItem = {
        id: Math.max(...state.items.map(i => i.id), 0) + 1,
        name: document.getElementById('product-name').value,
        description: document.getElementById('product-description').value,
        category: document.getElementById('product-category').value,
        price: parseFloat(document.getElementById('product-price').value),
        quantity: parseInt(document.getElementById('product-quantity').value),
        picture: document.getElementById('product-image').value
    };

    state.items.push(newItem);
    state.filteredItems = [...state.items];
    saveItemsToStorage();
    
    document.getElementById('add-item-form').reset();
    document.getElementById('add-items-modal').classList.remove('active');
    showNotification('Product added successfully', 'success');
    renderProducts();
}

// ==================== CAROUSEL ====================
function renderCarousel() {
    const carousel = document.getElementById('product-carousel');
    const featuredItems = state.items.slice(0, 8);

    carousel.innerHTML = featuredItems.map(item => `
        <div class="carousel-slide">
            ${item.picture ? `<img src="${item.picture}" alt="${item.name}" onerror="this.style.display='none'">` : ''}
            ${!item.picture ? `<div class="carousel-img-placeholder">No Image</div>` : ''}
            <div class="carousel-info">
                <div class="carousel-name">${item.name}</div>
                <div class="carousel-price">$${item.price.toFixed(2)}</div>
                ${item.quantity > 0 ? 
                    `<button class="carousel-btn" onclick="addToCart(${item.id}, this)">Add to Cart</button>` :
                    `<button class="carousel-btn" disabled>Out of Stock</button>`
                }
            </div>
        </div>
    `).join('');
}

// ==================== CART MANAGEMENT ====================
function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('cart-overlay');
    
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    const totalCount = state.cart.reduce((sum, item) => sum + item.cartQuantity, 0);
    cartCount.textContent = totalCount;

    const cartContent = document.getElementById('cart-content');
    const checkoutBtn = document.getElementById('checkout-btn');

    if (state.cart.length === 0) {
        cartContent.innerHTML = '<div class="empty-cart">Your cart is empty</div>';
        checkoutBtn.disabled = true;
        document.getElementById('cart-total').textContent = '0.00';
        return;
    }

    const cartTotal = state.cart.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0);
    document.getElementById('cart-total').textContent = cartTotal.toFixed(2);
    checkoutBtn.disabled = false;

    cartContent.innerHTML = `
        <div class="cart-items">
            ${state.cart.map(item => `
                <div class="cart-item">
                    ${item.picture ? `<img src="${item.picture}" alt="${item.name}">` : ''}
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">$${item.price.toFixed(2)}</div>
                        <div class="cart-item-quantity">
                            <button class="quantity-btn" onclick="updateCartQuantity(${item.id}, -1)">-</button>
                            <span>${item.cartQuantity}</span>
                            <button class="quantity-btn" onclick="updateCartQuantity(${item.id}, 1)">+</button>
                        </div>
                    </div>
                    <button class="remove-item-btn" onclick="removeFromCart(${item.id})" title="Remove">×</button>
                </div>
            `).join('')}
        </div>
    `;
}

function updateCartQuantity(itemId, change) {
    const cartItem = state.cart.find(ci => ci.id === itemId);
    const product = state.items.find(i => i.id === itemId);

    if (!cartItem) return;

    const newQuantity = cartItem.cartQuantity + change;

    if (newQuantity <= 0) {
        removeFromCart(itemId);
        return;
    }

    // Check if we have enough stock
    const currentStock = product.quantity;
    if (change > 0 && currentStock <= 0) {
        showNotification('Not enough stock', 'error');
        return;
    }

    cartItem.cartQuantity = newQuantity;
    
    // Update product quantity
    if (change < 0) {
        product.quantity -= change; // adding back since change is negative
    } else {
        product.quantity -= change;
    }

    saveCartToStorage();
    saveItemsToStorage();
    updateCartUI();
    renderProducts();
}

function removeFromCart(itemId) {
    const cartItem = state.cart.find(ci => ci.id === itemId);
    const product = state.items.find(i => i.id === itemId);

    if (cartItem && product) {
        product.quantity += cartItem.cartQuantity;
    }

    state.cart = state.cart.filter(item => item.id !== itemId);
    saveCartToStorage();
    saveItemsToStorage();
    updateCartUI();
    renderProducts();
    showNotification('Item removed from cart', 'success');
}

function handleCheckout() {
    if (state.cart.length === 0) {
        showNotification('Cart is empty', 'error');
        return;
    }

    const order = {
        id: Date.now(),
        items: [...state.cart],
        total: state.cart.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0),
        date: new Date().toLocaleDateString()
    };

    const orders = JSON.parse(localStorage.getItem('ecommerceOrders') || '[]');
    orders.push(order);
    localStorage.setItem('ecommerceOrders', JSON.stringify(orders));

    state.cart = [];
    saveCartToStorage();
    updateCartUI();
    toggleCart();
    showNotification('Order placed successfully!', 'success');
    renderProducts();
}

// ==================== CONTACT FORM ====================
function handleContactSubmit(e) {
    e.preventDefault();
    
    const formData = {
        name: document.getElementById('contact-name').value,
        email: document.getElementById('contact-email').value,
        subject: document.getElementById('contact-subject').value,
        message: document.getElementById('contact-message').value,
        date: new Date().toISOString()
    };

    const messages = JSON.parse(localStorage.getItem('contactMessages') || '[]');
    messages.push(formData);
    localStorage.setItem('contactMessages', JSON.stringify(messages));

    document.getElementById('contact-form').reset();
    showNotification('Message sent successfully! We will contact you soon.', 'success');
}

// ==================== NOTIFICATIONS ====================
function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 4000);
}

// ==================== STORAGE ====================
function saveItemsToStorage() {
    localStorage.setItem('ecommerceItems', JSON.stringify(state.items));
}

function loadItemsFromStorage() {
    const saved = localStorage.getItem('ecommerceItems');
    if (saved) {
        state.items = JSON.parse(saved);
    }
}

function saveCartToStorage() {
    localStorage.setItem('ecommerceCart', JSON.stringify(state.cart));
}

function loadCartFromStorage() {
    const saved = localStorage.getItem('ecommerceCart');
    if (saved) {
        state.cart = JSON.parse(saved);
        updateCartUI();
    }
}

// Initialize on load
window.addEventListener('load', () => {
    updateCartUI();
});
