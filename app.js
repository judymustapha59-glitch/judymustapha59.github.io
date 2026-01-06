// ==================== STATE MANAGEMENT ====================
const UI_DELAY = 250;
const FILTER_DELAY = 200;

let state = {
    items: [],
    cart: [],
    currentPage: 'home',
    filteredItems: [],
    theme: localStorage.getItem('theme') || 'light',
    loading: false,
    demoModeBannerVisible: localStorage.getItem('demoBannerVisible') !== 'false'
};

// ==================== ANALYTICS TRACKING ====================
function trackEvent(name, data = {}) {
    const events = JSON.parse(localStorage.getItem('demoAnalytics') || '[]');
    events.push({
        event: name,
        data,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('demoAnalytics', JSON.stringify(events));
    console.debug('[Analytics]', name, data);
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    // show skeletons while initial content "loads"
    state.loading = true;
    initializeApp();
    setupEventListeners();
    applyTheme();
    loadItemsFromStorage();
    loadCartFromStorage();

    // Use location.hash to preserve page across refresh/back/forward
    const initialFromHash = (location.hash || '').replace('#', '');
    const initialPage = initialFromHash || state.currentPage || 'home';
    renderPage(initialPage);

    // remove loading after a short moment and re-render real content
    setTimeout(() => {
        state.loading = false;
        renderPage(state.currentPage);
    }, UI_DELAY);
});

function initializeApp() {
    // Initialize items from localStorage or use seed items
    const savedItems = localStorage.getItem('ecommerceItems');
    state.items = savedItems ? JSON.parse(savedItems) : SEED_ITEMS;
    // reflect demo admin visibility on body so CSS can hide admin-only controls
    try { document.body.dataset.demoAdmin = state.demoModeBannerVisible ? 'true' : 'false'; } catch (e) {}
    // don't store derived filteredItems; compute on demand
    renderCarousel();
    if (typeof renderTrustSignals === 'function') renderTrustSignals();
}

function openEditModal(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;
    const modal = document.getElementById('add-items-modal');
    document.getElementById('product-id').value = String(item.id);
    document.getElementById('product-name').value = item.name || '';
    document.getElementById('product-description').value = item.description || '';
    document.getElementById('product-category').value = item.category || '';
    document.getElementById('product-price').value = typeof item.price !== 'undefined' ? item.price : '';
    document.getElementById('product-quantity').value = typeof item.quantity !== 'undefined' ? item.quantity : '';
    document.getElementById('product-image').value = item.picture || '';
    if (document.getElementById('product-rating')) document.getElementById('product-rating').value = typeof item.rating !== 'undefined' ? item.rating : '';
    if (document.getElementById('product-review-count')) document.getElementById('product-review-count').value = typeof item.reviewCount !== 'undefined' ? item.reviewCount : '';
    const titleEl = document.getElementById('add-product-title');
    if (titleEl) titleEl.textContent = 'Edit Product (Admin)';
    openModal(modal);
}

function renderTrustSignals() {
    const elRating = document.getElementById('trust-rating');
    const elCount = document.getElementById('trust-count');
    if (!elRating && !elCount) return;
    const items = state.items || [];
    const avg = items.length ? (items.reduce((s,i) => s + (Number(i.rating) || 0), 0) / items.length) : 0;
    const totalReviews = items.reduce((s,i) => s + (Number(i.reviewCount) || 0), 0);
    if (elRating) elRating.textContent = avg ? avg.toFixed(1) : '0.0';
    if (elCount) elCount.textContent = totalReviews ? (totalReviews.toLocaleString() + '+') : '0';
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

    // Demo mode banner close
    const demoBannerClose = document.getElementById('demo-banner-close');
    if (demoBannerClose) {
        demoBannerClose.addEventListener('click', () => {
            state.demoModeBannerVisible = false;
            localStorage.setItem('demoBannerVisible', 'false');
            const banner = document.getElementById('demo-banner');
            if (banner) banner.style.display = 'none';
            // reflect admin UI availability
            try { document.body.dataset.demoAdmin = 'false'; } catch (e) {}
        });
    }

    // Demo toggle button in header (reopen / toggle banner)
    const demoToggle = document.getElementById('demo-toggle');
    if (demoToggle) {
        // reflect current state
        demoToggle.setAttribute('aria-pressed', state.demoModeBannerVisible ? 'true' : 'false');
        demoToggle.addEventListener('click', () => {
            state.demoModeBannerVisible = !state.demoModeBannerVisible;
            localStorage.setItem('demoBannerVisible', state.demoModeBannerVisible ? 'true' : 'false');
            const banner = document.getElementById('demo-banner');
            if (banner) banner.style.display = state.demoModeBannerVisible ? 'flex' : 'none';
            demoToggle.setAttribute('aria-pressed', state.demoModeBannerVisible ? 'true' : 'false');
            // reflect admin UI availability
            try { document.body.dataset.demoAdmin = state.demoModeBannerVisible ? 'true' : 'false'; } catch (e) {}
        });
    }

    // Cart button
    document.getElementById('cart-btn').addEventListener('click', toggleCart);

    // Modal close buttons
    document.getElementById('close-cart-btn').addEventListener('click', toggleCart);
    document.getElementById('cart-overlay').addEventListener('click', () => {
        document.getElementById('cart-sidebar').classList.remove('open');
        document.getElementById('cart-overlay').classList.remove('active');
        // also close checkout modal if open
        const checkoutModal = document.getElementById('checkout-modal');
        if (checkoutModal && checkoutModal.classList.contains('active')) {
            closeModal(checkoutModal);
        }
    });

    // Add item button -> open modal with focus trap
    const addItemBtn = document.getElementById('add-item-btn');
    const addItemsModal = document.getElementById('add-items-modal');
    addItemBtn.addEventListener('click', () => openModal(addItemsModal));

    document.getElementById('close-add-form').addEventListener('click', () => closeModal(addItemsModal));

    // Checkout button -> open checkout modal (uses same overlay for demo dimming)
    const checkoutBtn = document.getElementById('checkout-btn');
    const checkoutModal = document.getElementById('checkout-modal');
    const cartOverlay = document.getElementById('cart-overlay');
    if (checkoutBtn && checkoutModal) {
        checkoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // track checkout opened
            trackEvent('checkout_opened', {
                cartItems: state.cart.length,
                cartTotal: state.cart.reduce((s, i) => s + i.price * i.cartQuantity, 0).toFixed(2)
            });
            // populate checkout total before opening modal
            const totalEl = document.getElementById('checkout-total');
            if (totalEl) {
                const total = state.cart.reduce((s, i) => s + i.price * i.cartQuantity, 0).toFixed(2);
                totalEl.textContent = total;
            }
            openModal(checkoutModal);
            if (cartOverlay) cartOverlay.classList.add('active');
        });
        const closeCheckout = document.getElementById('close-checkout');
        if (closeCheckout) {
            closeCheckout.addEventListener('click', () => {
                closeModal(checkoutModal);
                if (cartOverlay) cartOverlay.classList.remove('active');
            });
        }
    }

    // Add item form
    document.getElementById('add-item-form').addEventListener('submit', handleAddItem);

    // Checkout form -> show success modal
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Recalculate total from latest cart in state
            console.debug('[Checkout] State.cart before calc:', JSON.stringify(state.cart));
            
            let total = 0;
            if (state.cart && state.cart.length > 0) {
                total = state.cart.reduce((sum, item) => {
                    const itemPrice = parseFloat(item.price) || 0;
                    const itemQty = parseInt(item.cartQuantity) || 0;
                    console.debug(`  Item: ${item.name}, price=${itemPrice}, qty=${itemQty}, subtotal=${itemPrice * itemQty}`);
                    return sum + (itemPrice * itemQty);
                }, 0);
            }
            
            total = parseFloat(total).toFixed(2);
            const itemCount = state.cart ? state.cart.length : 0;

            console.log('[Checkout] Calculated Total: $' + total, 'Items:', itemCount);

            // track checkout completed
            trackEvent('checkout_completed', {
                total: parseFloat(total),
                items: itemCount,
                itemDetails: state.cart ? state.cart.map(i => ({
                    id: i.id,
                    name: i.name,
                    quantity: i.cartQuantity,
                    price: i.price
                })) : []
            });

            // Update success modal with current cart total
            const successTotalEl = document.getElementById('success-total');
            if (successTotalEl) {
                successTotalEl.textContent = '$' + total;
                console.log('[Checkout] Set #success-total to: $' + total);
            }
            document.getElementById('success-id').textContent = Date.now();

            // Save order to localStorage
            const order = {
                id: Date.now(),
                items: state.cart.map(i => ({
                    id: i.id,
                    name: i.name,
                    cartQuantity: i.cartQuantity,
                    price: i.price
                })),
                total: parseFloat(total),
                date: new Date().toISOString()
            };
            const orders = JSON.parse(localStorage.getItem('ecommerceOrders') || '[]');
            orders.push(order);
            localStorage.setItem('ecommerceOrders', JSON.stringify(orders));

            // Reduce inventory
            const products = JSON.parse(localStorage.getItem('ecommerceItems') || '[]');
            order.items.forEach(cartItem => {
                const product = products.find(p => p.id === cartItem.id);
                if (product) {
                    product.quantity -= cartItem.cartQuantity;
                }
            });
            localStorage.setItem('ecommerceItems', JSON.stringify(products));
            state.items = products; // update state

            state.cart = [];
            saveCartToStorage();
            updateCartUI();

            closeModal(document.getElementById('checkout-modal'));
            const overlay = document.getElementById('cart-overlay');
            if (overlay) overlay.classList.remove('active');
            openModal(document.getElementById('order-success'));
        });
    }

    // Continue shopping button
    const continueShopping = document.getElementById('continue-shopping-btn');
    if (continueShopping) {
        continueShopping.addEventListener('click', () => {
            closeModal(document.getElementById('order-success'));
            renderPage('products');
        });
    }

    // Contact form
    document.getElementById('contact-form').addEventListener('submit', handleContactSubmit);

    // Search and filter (debounced)
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', debounce(filterItems, 300));
    document.getElementById('category-filter').addEventListener('change', filterItems);

    // Checkout button
    document.getElementById('checkout-btn').addEventListener('click', handleCheckout);

    // Delegate clicks for dynamic buttons instead of inline handlers
    document.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.add-to-cart-btn');
        if (addBtn) {
            const id = Number(addBtn.dataset.id);
            const card = addBtn.closest('.item-card');
            const qtyInput = card ? card.querySelector('.quantity-input') : null;
            addToCart(id, qtyInput);
            return;
        }

        const carouselBtn = e.target.closest('.carousel-btn');
        if (carouselBtn) {
            const id = Number(carouselBtn.dataset.id);
            addToCart(id, 1);
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn && editBtn.dataset.id) {
            openEditModal(Number(editBtn.dataset.id));
            return;
        }

        const delBtn = e.target.closest('.delete-btn');
        if (delBtn && delBtn.dataset.id) {
            deleteProduct(Number(delBtn.dataset.id));
            return;
        }

        const qtyBtn = e.target.closest('.quantity-btn');
        if (qtyBtn && qtyBtn.dataset.change) {
            const id = Number(qtyBtn.dataset.id);
            const change = Number(qtyBtn.dataset.change);
            updateCartQuantity(id, change);
            return;
        }

        const removeBtn = e.target.closest('.remove-item-btn');
        if (removeBtn && removeBtn.dataset.id) {
            removeFromCart(Number(removeBtn.dataset.id));
            return;
        }

        const notifClose = e.target.closest('.notification-close');
        if (notifClose) {
            const n = notifClose.closest('.notification');
            if (n) n.remove();
            return;
        }
    });
}

// ======= Modal focus trap and keyboard support =======
let _lastActiveElement = null;
function openModal(modal) {
    if (!modal) return;
    _lastActiveElement = document.activeElement;
    modal.classList.add('active');
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function keyHandler(e) {
        if (e.key === 'Escape') {
            closeModal(modal);
        }
        if (e.key === 'Tab') {
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    }

    modal.__keyHandler = keyHandler;
    document.addEventListener('keydown', keyHandler);
    if (first) first.focus();
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    if (modal.__keyHandler) {
        document.removeEventListener('keydown', modal.__keyHandler);
        delete modal.__keyHandler;
    }
    if (_lastActiveElement && typeof _lastActiveElement.focus === 'function') {
        _lastActiveElement.focus();
        _lastActiveElement = null;
    }
}

// Close cart sidebar with Escape as well
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('cart-sidebar');
        const overlay = document.getElementById('cart-overlay');
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        }
    }
});

// ======= Image fallback handling =======
function getImageFallbackDataUri() {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='%23f0f0f0'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-family='Arial' font-size='20'>Image unavailable</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
}

// capture image load errors and replace with fallback
document.addEventListener('error', function onError(e) {
    const el = e.target;
    if (el && el.tagName === 'IMG') {
        if (!el.dataset.fallbackApplied) {
            el.dataset.fallbackApplied = '1';
            el.src = getImageFallbackDataUri();
            el.alt = el.alt || 'Image unavailable';
        }
    }
}, true);

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
    if (!btn) return;
    const isDark = state.theme === 'dark';
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

// ==================== SEO META MANAGEMENT ====================
function updatePageMeta(page) {
    const titles = {
        home: 'ALBARKA STORE | Vanilla JS E-Commerce Demo',
        products: 'Shop Products | ALBARKA STORE',
        orders: 'Order History | ALBARKA STORE',
        about: 'About Us | ALBARKA STORE',
        contact: 'Contact Us | ALBARKA STORE'
    };

    const descriptions = {
        home: 'ALBARKA STORE — A fully functional e-commerce site built with vanilla JavaScript, featuring dark mode, accessible modals, optimistic UI, and persistent cart.',
        products: 'Browse our selection of quality products. Search, filter by category, and add items to your cart with keyboard navigation support.',
        orders: 'View your complete order history with detailed order information and totals.',
        about: 'Learn about ALBARKA STORE — our mission to provide quality products with exceptional customer service.',
        contact: 'Get in touch with ALBARKA STORE. Send us a message and we\'ll respond as soon as possible.'
    };

    document.title = titles[page] || 'ALBARKA STORE';
    updateMetaDescription(descriptions[page] || titles[page]);
}

function updateMetaDescription(content) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
    }
    meta.content = content;
}

// ==================== STRUCTURED DATA (JSON-LD) ====================
function injectProductSchema(items) {
    // Remove old schema if exists
    const old = document.getElementById('product-schema');
    if (old) old.remove();

    if (!items || items.length === 0) return;

    const schema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": items.slice(0, 20).map((item, index) => ({
            "@type": "Product",
            "position": index + 1,
            "name": item.name,
            "description": item.description,
            "image": item.picture || undefined,
            "offers": {
                "@type": "Offer",
                "priceCurrency": "USD",
                "price": String(item.price),
                "availability": item.quantity > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock"
            }
            ,
            "aggregateRating": item.rating && item.reviewCount ? {
                "@type": "AggregateRating",
                "ratingValue": String(item.rating),
                "reviewCount": String(item.reviewCount)
            } : undefined
        })).filter(p => p.name) // remove empty entries
    };

    const script = document.createElement('script');
    script.id = 'product-schema';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
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

    // Update SEO meta
    updatePageMeta(page);

    if (page === 'products') {
        renderProducts();
    }
    if (page === 'orders') {
        renderOrders();
    }
    if (page === 'admin') {
        renderAdminAnalytics();
    }

    // update URL hash so page persists across refresh and supports back/forward
    try {
        const currentHash = (location.hash || '').replace('#', '');
        if (currentHash !== page) {
            location.hash = page;
        }
    } catch (err) {
        // ignore
    }
}

// ==================== HELPERS ====================
function getFilteredItems() {
    const searchText = document.getElementById('search-input')?.value.toLowerCase() || '';
    const category = document.getElementById('category-filter')?.value || '';
    return state.items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchText) || item.description.toLowerCase().includes(searchText);
        const matchesCategory = !category || item.category === category;
        return matchesSearch && matchesCategory;
    });
}

function decreaseStock(itemId, qty) {
    const item = state.items.find(i => i.id === itemId);
    if (!item || item.quantity < qty) return false;
    item.quantity -= qty;
    return true;
}

function increaseStock(itemId, qty) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;
    item.quantity += qty;
}

// render stars as symbols based on numeric rating (0-5)
function renderStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalf = (rating % 1) >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
    let out = '';
    for (let i = 0; i < fullStars; i++) {
        out += '<span class="star full" aria-hidden="true">★</span>';
    }
    if (hasHalf) {
        out += '<span class="star half" aria-hidden="true"><span class="star-fill">★</span><span class="star-empty">★</span></span>';
    }
    for (let i = 0; i < emptyStars; i++) {
        out += '<span class="star empty" aria-hidden="true">★</span>';
    }
    return out;
}

// debounce helper
function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

// ======= DOM builders (DocumentFragment usage) =======
function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'item-card';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'item-image';
    if (item.picture) {
        const img = document.createElement('img');
        img.src = item.picture;
        img.alt = `${item.name} product image`;
        img.loading = 'lazy';
        imgWrap.appendChild(img);
    } else {
        const ph = document.createElement('div');
        ph.className = 'image-placeholder';
        ph.textContent = 'No Image';
        imgWrap.appendChild(ph);
    }

    const info = document.createElement('div');
    info.className = 'product-info';
    info.innerHTML = `
        <h2>${item.name}</h2>
        <span class="category">${item.category}</span>
        <p>${item.description}</p>
        <div class="product-footer"><span class="product-price">$${item.price.toFixed(2)}</span></div>
    `;

    // Add rating display if available
    if (item.rating && item.reviewCount) {
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'rating';
        ratingDiv.setAttribute('role', 'img');
        ratingDiv.setAttribute('aria-label', `Rated ${item.rating} out of 5 stars based on ${item.reviewCount} reviews`);
        ratingDiv.innerHTML = `<span class="stars">${renderStars(item.rating)}</span><span class="review-count">(${item.reviewCount})</span>`;
        console.debug('Adding rating for', item.id, item.name, item.rating, item.reviewCount);
        info.insertBefore(ratingDiv, info.querySelector('.category'));
    }

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:0.5rem;margin-top:0.5rem;';
    if (item.quantity > 0) {
        const pq = document.createElement('div');
        pq.className = 'product-quantity';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'quantity-input';
        input.value = '1';
        input.min = '1';
        input.max = String(item.quantity);
        const btn = document.createElement('button');
        btn.className = 'add-to-cart-btn';
        btn.dataset.id = String(item.id);
        btn.textContent = 'Add';
        pq.appendChild(input);
        pq.appendChild(btn);
        actions.appendChild(pq);
    } else {
        const btn = document.createElement('button');
        btn.className = 'add-to-cart-btn';
        btn.disabled = true;
        btn.textContent = 'Out of Stock';
        actions.appendChild(btn);
    }

    info.appendChild(actions);

    if (item.quantity <= 0) {
        const oos = document.createElement('div');
        oos.style.cssText = 'color:#ff4444;font-size:0.85rem;margin-top:0.5rem;';
        oos.textContent = 'Out of Stock';
        info.appendChild(oos);
    } else {
        const inStock = document.createElement('div');
        inStock.style.cssText = 'color:var(--text-secondary);font-size:0.85rem;margin-top:0.5rem;';
        inStock.textContent = `${item.quantity} in stock`;
        info.appendChild(inStock);
    }

    const edit = document.createElement('button');
    edit.className = 'edit-btn admin-only';
    edit.dataset.id = String(item.id);
    edit.title = 'Edit product';
    edit.setAttribute('aria-label', 'Edit product');
    edit.textContent = '✎';

    const del = document.createElement('button');
    del.className = 'delete-btn admin-only';
    del.dataset.id = String(item.id);
    del.title = 'Delete product';
    del.setAttribute('aria-label', 'Delete product');
    del.textContent = '×';

    card.appendChild(imgWrap);
    card.appendChild(info);
    card.appendChild(edit);
    card.appendChild(del);
    return card;
}

function createCarouselSlide(item) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    if (item.picture) {
        const img = document.createElement('img');
        img.src = item.picture;
        img.alt = `${item.name} featured product`;
        img.loading = 'lazy';
        slide.appendChild(img);
    } else {
        const ph = document.createElement('div');
        ph.className = 'carousel-img-placeholder';
        ph.textContent = 'No Image';
        slide.appendChild(ph);
    }
    const info = document.createElement('div');
    info.className = 'carousel-info';
    info.innerHTML = `<div class="carousel-name">${item.name}</div><div class="carousel-price">$${item.price.toFixed(2)}</div>`;
        if (item.rating && item.reviewCount) {
            const ratingDiv = document.createElement('div');
            ratingDiv.className = 'carousel-rating';
            ratingDiv.setAttribute('role', 'img');
            ratingDiv.setAttribute('aria-label', `Rated ${item.rating} out of 5 stars based on ${item.reviewCount} reviews`);
            ratingDiv.innerHTML = `<span class="carousel-stars">${renderStars(item.rating)}</span><span class="carousel-review-count">(${item.reviewCount})</span>`;
            info.appendChild(ratingDiv);
        }

    if (item.quantity > 0) {
        const btn = document.createElement('button');
        btn.className = 'carousel-btn';
        btn.dataset.id = String(item.id);
        btn.textContent = 'Add to Cart';
        info.appendChild(btn);
    } else {
        const btn = document.createElement('button');
        btn.className = 'carousel-btn';
        btn.disabled = true;
        btn.textContent = 'Out of Stock';
        info.appendChild(btn);
    }
    slide.appendChild(info);
    return slide;
}

function createCartItemElement(item) {
    const wrap = document.createElement('div');
    wrap.className = 'cart-item';
    if (item.picture) {
        const img = document.createElement('img');
        img.src = item.picture;
        img.alt = `${item.name} cart item`;
        img.loading = 'lazy';
        wrap.appendChild(img);
    }
    const info = document.createElement('div');
    info.className = 'cart-item-info';
    info.innerHTML = `<div class="cart-item-name">${item.name}</div><div class="cart-item-price">$${item.price.toFixed(2)}</div>`;

    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'cart-item-quantity';
    const dec = document.createElement('button');
    dec.className = 'quantity-btn';
    dec.dataset.id = String(item.id);
    dec.dataset.change = '-1';
    dec.setAttribute('aria-label', 'Decrease quantity');
    dec.textContent = '-';
    const span = document.createElement('span');
    span.textContent = String(item.cartQuantity);
    const inc = document.createElement('button');
    inc.className = 'quantity-btn';
    inc.dataset.id = String(item.id);
    inc.dataset.change = '1';
    inc.setAttribute('aria-label', 'Increase quantity');
    inc.textContent = '+';
    qtyWrap.appendChild(dec);
    qtyWrap.appendChild(span);
    qtyWrap.appendChild(inc);

    info.appendChild(qtyWrap);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-item-btn';
    removeBtn.dataset.id = String(item.id);
    removeBtn.title = 'Remove';
    removeBtn.setAttribute('aria-label', 'Remove item from cart');
    removeBtn.textContent = '×';

    wrap.appendChild(info);
    wrap.appendChild(removeBtn);
    return wrap;
}

// respond to browser back/forward or manual hash change
window.addEventListener('hashchange', () => {
    const pageFromHash = (location.hash || '').replace('#', '') || 'home';
    renderPage(pageFromHash);
});

// ==================== PRODUCTS PAGE ====================
function renderProducts() {
    const grid = document.getElementById('items-grid');
    // show skeleton loaders while loading
    const items = getFilteredItems();

    if (state.loading) {
        const skeletonCount = 6;
        grid.innerHTML = Array.from({ length: skeletonCount }).map(() => `
            <div class="item-card skeleton-card" aria-hidden="true">
                <div class="item-image skeleton-image"></div>
                <div class="product-info">
                    <div class="skeleton-line title"></div>
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line price"></div>
                </div>
            </div>
        `).join('');
        return;
    }
    if (items.length === 0) {
        const searchText = document.getElementById('search-input')?.value || '';
        if (searchText.trim() !== '') {
            grid.innerHTML = `<div class="no-items" role="status" aria-live="polite">No products match your search.</div>`;
        } else {
            grid.innerHTML = '<div class="no-items">No products found</div>';
        }
        return;
    }
    // Build using DocumentFragment and existing DOM-builder helper
    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const card = createItemCard(item);
        // make card keyboard focusable for arrow-key navigation
        card.setAttribute('tabindex', '0');
        card.dataset.id = String(item.id);
        frag.appendChild(card);
    });
    grid.innerHTML = '';
    grid.appendChild(frag);
    // ensure keyboard nav is wired after DOM is updated
    setupKeyboardNavigation();
    
    // inject product schema for SEO
    injectProductSchema(items);
}

function filterItems() {
    const searchText = document.getElementById('search-input').value.toLowerCase();
    const category = document.getElementById('category-filter').value;

    // show skeletons briefly for UX while filtering
    state.loading = true;
    renderProducts();

    setTimeout(() => {
        // no derived state saved; renderProducts will compute filtered items
        state.loading = false;
        renderProducts();
    }, FILTER_DELAY);
}

function addToCart(itemId, quantitySource) {
    let quantity = 1;
    if (typeof quantitySource === 'number') {
        quantity = quantitySource;
    } else if (quantitySource && typeof quantitySource.value !== 'undefined') {
        quantity = parseInt(quantitySource.value) || 1;
    }

    const item = state.items.find(i => i.id === itemId);
    if (!item || item.quantity < quantity) {
        showNotification('Not enough stock', 'error');
        return;
    }

    // optimistic update: capture snapshots for rollback
    const prevItemQuantity = item.quantity;
    const existingCartItem = state.cart.find(ci => ci.id === itemId);
    const prevCartItemQty = existingCartItem ? existingCartItem.cartQuantity : 0;

    // apply optimistic changes
    const decreased = decreaseStock(itemId, quantity);
    if (!decreased) {
        showNotification('Not enough stock', 'error');
        return;
    }

    if (existingCartItem) {
        existingCartItem.cartQuantity += quantity;
    } else {
        state.cart.push({ id: item.id, name: item.name, price: item.price, picture: item.picture, cartQuantity: quantity });
    }

    // update UI immediately
    updateCartUI();
    renderProducts();

    // try persist changes; rollback on failure
    const itemsSaved = saveItemsToStorage();
    const cartSaved = saveCartToStorage();
    if (!itemsSaved || !cartSaved) {
        // rollback
        const restoredItem = state.items.find(i => i.id === itemId);
        if (restoredItem) restoredItem.quantity = prevItemQuantity;

        const cartEntry = state.cart.find(ci => ci.id === itemId);
        if (cartEntry) {
            if (prevCartItemQty > 0) {
                cartEntry.cartQuantity = prevCartItemQty;
            } else {
                state.cart = state.cart.filter(ci => ci.id !== itemId);
            }
        }

        // try re-save best-effort
        saveItemsToStorage();
        saveCartToStorage();
        updateCartUI();
        renderProducts();
        showNotification('Failed to add to cart — rolled back', 'error');
        return;
    }

    showNotification(`Added ${quantity} ${item.name}(s) to cart`, 'success');
}

function deleteProduct(itemId) {
    if (confirm('Are you sure you want to delete this product?')) {
        state.items = state.items.filter(item => item.id !== itemId);
        saveItemsToStorage();
        renderProducts();
        showNotification('Product deleted', 'success');
    }
}

function handleAddItem(e) {
    e.preventDefault();

    const editId = document.getElementById('product-id')?.value;
    const name = document.getElementById('product-name').value;
    const description = document.getElementById('product-description').value;
    const category = document.getElementById('product-category').value;
    const price = parseFloat(document.getElementById('product-price').value);
    const quantity = parseInt(document.getElementById('product-quantity').value);
    const picture = document.getElementById('product-image').value;
    const rating = parseFloat(document.getElementById('product-rating')?.value) || undefined;
    const reviewCount = parseInt(document.getElementById('product-review-count')?.value) || undefined;

    if (editId) {
        const id = Number(editId);
        const item = state.items.find(i => i.id === id);
        if (item) {
            item.name = name;
            item.description = description;
            item.category = category;
            item.price = price;
            item.quantity = quantity;
            item.picture = picture;
            if (typeof rating !== 'undefined') item.rating = rating;
            if (typeof reviewCount !== 'undefined') item.reviewCount = reviewCount;
            saveItemsToStorage();
            showNotification('Product updated', 'success');
        }
    } else {
        const newItem = {
            id: Math.max(...state.items.map(i => i.id), 0) + 1,
            name,
            description,
            category,
            price,
            quantity,
            picture,
            rating: typeof rating !== 'undefined' ? rating : undefined,
            reviewCount: typeof reviewCount !== 'undefined' ? reviewCount : undefined
        };
        state.items.push(newItem);
        saveItemsToStorage();
        showNotification('Product added successfully', 'success');
    }

    document.getElementById('add-item-form').reset();
    document.getElementById('product-id').value = '';
    const titleEl = document.getElementById('add-product-title');
    if (titleEl) titleEl.textContent = 'Admin product management (demo)';
    closeModal(document.getElementById('add-items-modal'));
    renderProducts();
    if (typeof renderTrustSignals === 'function') renderTrustSignals();
}

// ==================== CAROUSEL ====================
function renderCarousel() {
    const carousel = document.getElementById('product-carousel');
    const featuredItems = state.items.slice(0, 8);

    carousel.innerHTML = featuredItems.map(item => `
        <div class="carousel-slide">
            ${item.picture ? `<img src="${item.picture}" alt="${item.name}">` : ''}
            ${!item.picture ? `<div class="carousel-img-placeholder">No Image</div>` : ''}
            <div class="carousel-info">
                <div class="carousel-name">${item.name}</div>
                <div class="carousel-price">$${item.price.toFixed(2)}</div>
                ${item.quantity > 0 ? 
                    `<button class="carousel-btn" data-id="${item.id}">Add to Cart</button>` :
                    `<button class="carousel-btn" disabled>Out of Stock</button>`
                }
            </div>
        </div>
    `).join('');
}

// ==================== ORDERS PAGE ====================
function renderOrders() {
    const container = document.getElementById('orders-list');
    const raw = localStorage.getItem('ecommerceOrders');
    let orders = [];
    try {
        orders = JSON.parse(raw || '[]');
    } catch (err) {
        orders = [];
    }

    if (!orders || orders.length === 0) {
        container.innerHTML = '<div class="no-orders">You have no past orders.</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    orders.slice().reverse().forEach(order => {
        const wrap = document.createElement('div');
        wrap.className = 'order-card';
        const header = document.createElement('div');
        header.className = 'order-header';
        header.innerHTML = `<div class="order-id">Order #${order.id}</div><div class="order-date">${order.date || ''}</div><div class="order-total">Total: $${(order.total||0).toFixed(2)}</div>`;
        wrap.appendChild(header);

        const list = document.createElement('div');
        list.className = 'order-items';
        (order.items || []).forEach(it => {
            const row = document.createElement('div');
            row.className = 'order-item';
            row.innerHTML = `<div class="order-item-name">${it.name}</div><div class="order-item-qty">x${it.cartQuantity}</div><div class="order-item-price">$${(it.price||0).toFixed(2)}</div>`;
            list.appendChild(row);
        });

        wrap.appendChild(list);
        frag.appendChild(wrap);
    });

    container.innerHTML = '';
    container.appendChild(frag);
}

// ==================== ADMIN ANALYTICS ====================
function renderAdminAnalytics() {
    const orders = JSON.parse(localStorage.getItem('ecommerceOrders') || '[]');
    const events = JSON.parse(localStorage.getItem('demoAnalytics') || '[]');

    const fromInput = document.getElementById('date-from')?.value;
    const toInput = document.getElementById('date-to')?.value;

    const fromDate = fromInput ? new Date(fromInput) : null;
    const toDate = toInput ? new Date(toInput) : null;

    const filteredOrders = orders.filter(order => {
        const d = new Date(order.date);
        return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });

    let revenue = 0;
    let totalItems = 0;
    const productMap = {};
    const dailySales = {};

    filteredOrders.forEach(order => {
        revenue += order.total;

        const day = order.date.slice(0, 10);
        dailySales[day] = (dailySales[day] || 0) + order.total;

        order.items.forEach(item => {
            totalItems += item.cartQuantity;
            productMap[item.name] = (productMap[item.name] || 0) + item.cartQuantity;
        });
    });

    document.getElementById('stat-revenue').textContent = revenue.toFixed(2);
    document.getElementById('stat-orders').textContent = filteredOrders.length;
    document.getElementById('stat-items').textContent = totalItems;

    // Top products (rendered by renderProductChart)
    // Funnel
    const checkoutOpened = events.filter(e => e.event === 'checkout_opened').length;
    const completed = events.filter(e => e.event === 'checkout_completed').length;

    document.getElementById('conversion-funnel').innerHTML = `
        <li>Checkout Opened: ${checkoutOpened}</li>
        <li>Orders Completed: ${completed}</li>
        <li>Conversion Rate: ${
            checkoutOpened ? ((completed / checkoutOpened) * 100).toFixed(1) : 0
        }%</li>
    `;

    renderSalesChart(dailySales);
    renderProductChart();
    renderInventory();
    renderOrdersList();
}

function renderInventory() {
    const products = JSON.parse(localStorage.getItem('ecommerceItems') || '[]');
    const list = document.getElementById('inventory-list');
    if (!list) return;

    list.innerHTML = products.map(p => `
        <li>
            ${p.name} —
            <strong>${p.quantity}</strong> in stock
            ${p.quantity < 5 ? '⚠️ Low stock' : ''}
        </li>
    `).join('');
}

function renderOrdersList() {
    const orders = JSON.parse(localStorage.getItem('ecommerceOrders') || '[]');
    const list = document.getElementById('orders-list');
    if (!list) return;

    if (orders.length === 0) {
        list.innerHTML = '<li><p>No orders yet</p></li>';
        return;
    }

    list.innerHTML = orders.slice(-5).reverse().map((order, idx) => `
        <li>
            <button type="button" class="order-btn" data-order-id="${order.id}">
                Order #${order.id} — $${parseFloat(order.total).toFixed(2)}
            </button>
        </li>
    `).join('');

    // Add event listeners to order buttons
    list.querySelectorAll('.order-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showOrderDetails(parseInt(btn.dataset.orderId));
        });
    });
}

function showOrderDetails(orderId) {
    const orders = JSON.parse(localStorage.getItem('ecommerceOrders') || '[]');
    const order = orders.find(o => o.id === orderId || o.id === parseInt(orderId));
    if (!order) {
        console.warn('Order not found for ID:', orderId);
        return;
    }

    const box = document.getElementById('order-details');
    if (!box) return;
    box.classList.remove('hidden');

    box.innerHTML = `
        <h4>Order #${order.id}</h4>
        <p>Date: ${new Date(order.date).toLocaleString()}</p>
        <ul>
            ${order.items.map(i => `
                <li>${i.name} × ${i.cartQuantity} — $${parseFloat(i.price).toFixed(2)}</li>
            `).join('')}
        </ul>
        <strong>Total: $${parseFloat(order.total).toFixed(2)}</strong>
    `;
}

function renderSalesChart(dailySales) {
    const chart = document.getElementById('sales-chart');
    if (!chart) return;
    chart.innerHTML = '';

    const entries = Object.entries(dailySales);
    if (!entries.length) {
        chart.innerHTML = '<p style="color: var(--text-secondary); margin: 1rem 0;">No data</p>';
        return;
    }

    const max = Math.max(...entries.map(e => e[1]));

    entries.forEach(([date, amount]) => {
        const height = (amount / max) * 100;
        chart.innerHTML += `<div class="bar" style="height:${height}%"><span>$${amount.toFixed(0)}</span></div>`;
    });
}

function renderProductChart() {
    const orders = JSON.parse(localStorage.getItem('ecommerceOrders') || '[]');
    const map = {};

    orders.forEach(o => {
        o.items.forEach(i => {
            map[i.name] = (map[i.name] || 0) + i.cartQuantity;
        });
    });

    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const chart = document.getElementById('product-chart');
    if (!chart) return;
    chart.innerHTML = '';

    if (!entries.length) {
        chart.innerHTML = '<p style="color: var(--text-secondary); margin: 1rem 0;">No product data</p>';
        return;
    }

    const max = Math.max(...entries.map(e => e[1]));

    entries.forEach(([name, qty]) => {
        const height = (qty / max) * 100;
        chart.innerHTML += `
            <div class="bar" style="height:${height}%">
                <span>${name} (${qty})</span>
            </div>
        `;
    });
}

// ==================== KEYBOARD NAVIGATION ====================
// attach listener once during init; use event delegation to handle any card focus
function setupKeyboardNavigation() {
    const grid = document.getElementById('items-grid');
    if (!grid || grid.dataset.keyboardListenerAttached) return; // prevent duplicate listeners

    grid.dataset.keyboardListenerAttached = 'true';
    grid.addEventListener('keydown', (e) => {
        const card = e.target.closest && e.target.closest('.item-card');
        if (!card) return;

        const all = Array.from(grid.querySelectorAll('.item-card'));
        const idx = all.indexOf(card);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            const next = all[idx + 1] || all[0];
            next && next.focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = all[idx - 1] || all[all.length - 1];
            prev && prev.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const addBtn = card.querySelector('.add-to-cart-btn');
            const qtyInput = card.querySelector('.quantity-input');
            if (addBtn && !addBtn.disabled) {
                if (qtyInput) {
                    addToCart(parseInt(addBtn.dataset.id), qtyInput);
                } else {
                    addToCart(parseInt(addBtn.dataset.id), 1);
                }
            }
        }
    });
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
                            <button class="quantity-btn" data-id="${item.id}" data-change="-1">-</button>
                            <span>${item.cartQuantity}</span>
                            <button class="quantity-btn" data-id="${item.id}" data-change="1">+</button>
                        </div>
                    </div>
                    <button class="remove-item-btn" data-id="${item.id}" title="Remove">×</button>
                </div>
            `).join('')}
        </div>
    `;
}

function updateCartQuantity(itemId, change) {
    const cartItem = state.cart.find(ci => ci.id === itemId);
    if (!cartItem) return;

    const newQuantity = cartItem.cartQuantity + change;

    if (newQuantity <= 0) {
        removeFromCart(itemId);
        return;
    }

    if (change > 0) {
        // try to decrease stock for the added units
        // optimistic: capture previous qty
        const prevItemQuantity = state.items.find(i => i.id === itemId)?.quantity;
        const prevCartQuantity = cartItem.cartQuantity;

        const ok = decreaseStock(itemId, change);
        if (!ok) {
            showNotification('Not enough stock', 'error');
            return;
        }

        cartItem.cartQuantity = newQuantity;
        updateCartUI();

        const itemsSaved = saveItemsToStorage();
        const cartSaved = saveCartToStorage();
        if (!itemsSaved || !cartSaved) {
            // rollback
            const restoredItem = state.items.find(i => i.id === itemId);
            if (restoredItem && typeof prevItemQuantity !== 'undefined') restoredItem.quantity = prevItemQuantity;
            cartItem.cartQuantity = prevCartQuantity;
            saveItemsToStorage();
            saveCartToStorage();
            updateCartUI();
            showNotification('Failed to update cart — rolled back', 'error');
            return;
        }
        renderProducts();
        return;
    } else if (change < 0) {
        // returning items to stock
        increaseStock(itemId, -change);
    }
    cartItem.cartQuantity = newQuantity;

    saveCartToStorage();
    saveItemsToStorage();
    updateCartUI();
    renderProducts();
}

function removeFromCart(itemId) {
    const cartItem = state.cart.find(ci => ci.id === itemId);
    if (cartItem) {
        increaseStock(itemId, cartItem.cartQuantity);
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
        <button class="notification-close">×</button>
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
    try {
        localStorage.setItem('ecommerceItems', JSON.stringify(state.items));
        if (typeof renderTrustSignals === 'function') renderTrustSignals();
        return true;
    } catch (err) {
        console.error('Failed to save items to storage', err);
        showNotification('Unable to save items to local storage.', 'error');
        return false;
    }
}

function loadItemsFromStorage() {
    const saved = localStorage.getItem('ecommerceItems');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Backfill ratings from SEED_ITEMS for older installs
            const merged = parsed.map(si => {
                if (typeof si.rating === 'undefined' || typeof si.reviewCount === 'undefined') {
                    const seed = (typeof SEED_ITEMS !== 'undefined' && Array.isArray(SEED_ITEMS)) ? SEED_ITEMS.find(s => s.id === si.id) : undefined;
                    if (seed) {
                        si.rating = typeof si.rating === 'undefined' ? seed.rating : si.rating;
                        si.reviewCount = typeof si.reviewCount === 'undefined' ? seed.reviewCount : si.reviewCount;
                    }
                }
                return si;
            });
            state.items = merged;
            // persist merged items so future loads have ratings
            try { localStorage.setItem('ecommerceItems', JSON.stringify(state.items)); } catch (e) { /* best-effort */ }
        } catch (e) {
            // fallback to seeds if parse fails
            state.items = SEED_ITEMS;
        }
    }
}

function saveCartToStorage() {
    try {
        localStorage.setItem('ecommerceCart', JSON.stringify(state.cart));
        return true;
    } catch (err) {
        console.error('Failed to save cart to storage', err);
        showNotification('Unable to save cart to local storage.', 'error');
        return false;
    }
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
    setupKeyboardNavigation();
    // if the orders page is active on load, render it
    const pageFromHash = (location.hash || '').replace('#', '') || 'home';
    if (pageFromHash === 'orders') renderOrders();
});
