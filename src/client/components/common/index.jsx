import React from 'react';

export const Card = React.memo(({ children, className = '', style = {} }) => (
  <div className={`card bg-base-200 border border-base-300 shadow-xl ${className}`} style={style}>
    <div className="card-body p-6 flex-1 min-h-0">
      {children}
    </div>
  </div>
));

export const SectionTitle = React.memo(({ children, className = '' }) => (
  <h2 className={`text-lg font-bold text-base-content border-b border-base-300 pb-3 mb-5 ${className}`}>
    {children}
  </h2>
));

export const Input = React.memo(({ label, className = '', ...props }) => (
  <div className="form-control w-full mb-4">
    {label && (
      <label className="label py-1">
        <span className="label-text font-bold text-base-content/80">{label}</span>
      </label>
    )}
    <input className={`input input-bordered bg-base-100 focus:border-primary focus:outline-none transition-colors w-full ${className}`} {...props} />
  </div>
));

export const Textarea = React.memo(({ label, className = '', ...props }) => (
  <div className="form-control w-full mb-4">
    {label && (
      <label className="label py-1">
        <span className="label-text font-bold text-base-content/80">{label}</span>
      </label>
    )}
    <textarea className={`textarea textarea-bordered bg-base-100 focus:border-primary focus:outline-none transition-colors w-full leading-relaxed resize-y ${className}`} {...props} />
  </div>
));

export const Btn = React.memo(({ children, variant = 'primary', className = '', block = false, ...props }) => {
  const vMap = {
    primary:  'btn-primary shadow-primary/30',
    success:  'btn-success shadow-success/30',
    danger:   'btn-error shadow-error/30',
    warning:  'btn-warning shadow-warning/30',
    secondary:'btn-neutral shadow-base-content/30',
  };
  return (
    <button className={`btn shadow-sm hover:shadow-md transition-all ${vMap[variant] || 'btn-primary'} ${block ? 'btn-block' : ''} ${className}`} {...props}>
      {children}
    </button>
  );
});

export const StatusBadge = React.memo(({ status }) => {
  const map = {
    published: { badge: 'badge-success text-success-content', label: '발행완료' },
    failed:    { badge: 'badge-error text-error-content', label: '실패' },
    scheduled: { badge: 'badge-info text-info-content', label: '예약됨' },
    pending:   { badge: 'badge-warning text-warning-content', label: '대기중' },
    processing:{ badge: 'badge-primary text-primary-content', label: '처리중' },
    active:    { badge: 'badge-success text-success-content border-success/30', label: '활성' },
    paused:    { badge: 'badge-neutral border-neutral/30', label: '대기' },
  };
  const s = map[status] || { badge: 'badge-ghost', label: status };
  return (
    <span className={`badge ${s.badge} font-extrabold px-3 py-2.5 rounded-full text-xs uppercase tracking-wider`}>
      {s.label}
    </span>
  );
});

export const Modal = React.memo(({ title, show, onClose, children }) => {
  if (!show) return null;
  return (
    <dialog className="modal modal-open bg-black/60 backdrop-blur-sm transition-all" onClick={onClose}>
      <div className="modal-box w-11/12 max-w-4xl bg-base-200 border border-base-300 shadow-2xl p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="px-6 py-4 border-b border-base-300 flex justify-between items-center bg-base-300/50">
          <h3 className="font-extrabold text-xl text-base-content tracking-tight">{title}</h3>
          <button className="btn btn-sm btn-circle btn-ghost hover:bg-base-content/20" onClick={onClose}>✕</button>
        </header>
        <div className="p-6 max-h-[75vh] overflow-y-auto leading-relaxed text-base-content/90">
          {children}
        </div>
      </div>
    </dialog>
  );
});
