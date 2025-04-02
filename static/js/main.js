document.addEventListener('DOMContentLoaded', function() {
    // Tab functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Show corresponding tab pane
            const tabId = button.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
    
    // Search functionality
    const userSearch = document.getElementById('user-search');
    const roleSearch = document.getElementById('role-search');
    const policySearch = document.getElementById('policy-search');
    const groupSearch = document.getElementById('group-search');
    
    if (userSearch) {
        userSearch.addEventListener('input', function() {
            filterTable('users-tab', this.value);
        });
    }
    
    if (roleSearch) {
        roleSearch.addEventListener('input', function() {
            filterTable('roles-tab', this.value);
        });
    }
    
    if (policySearch) {
        policySearch.addEventListener('input', function() {
            filterTable('policies-tab', this.value);
        });
    }
    
    if (groupSearch) {
        groupSearch.addEventListener('input', function() {
            filterTable('groups-tab', this.value);
        });
    }
    
    function filterTable(tableId, query) {
        const table = document.querySelector(`#${tableId} .data-table`);
        const rows = table.querySelectorAll('tbody tr');
        
        query = query.toLowerCase();
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(query)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }
    
    // Accordion functionality
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    
    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            
            // Toggle active class on header
            header.classList.toggle('active');
            
            // Toggle display of content
            if (content.style.display === 'block') {
                content.style.display = 'none';
            } else {
                content.style.display = 'block';
            }
        });
    });
    
    // File input display
    const fileInput = document.getElementById('file');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            const fileName = this.files[0] ? this.files[0].name : 'Choose a file';
            this.nextElementSibling.textContent = fileName;
        });
    }
    
    // Setup responsive tables
    setupResponsiveTables();
    
    // Add function to handle ARN tooltips
    setupArnTooltips();
});

function setupResponsiveTables() {
    const tables = document.querySelectorAll('.data-table');
    
    tables.forEach(table => {
        const headerCells = table.querySelectorAll('thead th');
        const headerTexts = Array.from(headerCells).map(cell => cell.textContent.trim());
        
        const dataCells = table.querySelectorAll('tbody td');
        
        dataCells.forEach((cell, index) => {
            const headerIndex = index % headerTexts.length;
            cell.setAttribute('data-label', headerTexts[headerIndex]);
        });
    });
}

// Add function to handle ARN tooltips
function setupArnTooltips() {
    const arnElements = document.querySelectorAll('.truncated-arn');
    
    arnElements.forEach(element => {
        const fullArn = element.getAttribute('data-full-arn');
        
        // Create tooltip element
        const tooltip = document.createElement('span');
        tooltip.className = 'arn-tooltip';
        tooltip.textContent = fullArn;
        
        element.appendChild(tooltip);
    });
} 