import React from 'react';

export function Pagination({ currentPage, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
    }

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            marginTop: '20px',
            padding: '10px'
        }}>
            <button
                className="btn-secondary"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={{ padding: '6px 12px', fontSize: '13px' }}
            >
                Anterior
            </button>
            {pages.map(page => (
                <button
                    key={page}
                    className={currentPage === page ? "btn-primary" : "btn-secondary"}
                    onClick={() => onPageChange(page)}
                    style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        minWidth: '35px',
                        backgroundColor: currentPage === page ? 'var(--ambev-blue)' : 'transparent',
                        color: currentPage === page ? '#fff' : '#666',
                        border: '1px solid ' + (currentPage === page ? 'var(--ambev-blue)' : '#ddd')
                    }}
                >
                    {page}
                </button>
            ))}
            <button
                className="btn-secondary"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{ padding: '6px 12px', fontSize: '13px' }}
            >
                Próxima
            </button>
        </div>
    );
}

export default Pagination;
