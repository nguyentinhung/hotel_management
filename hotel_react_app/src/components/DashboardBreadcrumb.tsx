import { Link } from 'react-router-dom';

type DashboardBreadcrumbProps = {
  homeTo: string;
  currentPage: string;
  middlePage?: string;
  onMiddleClick?: () => void;
};

export default function DashboardBreadcrumb({ homeTo, currentPage, middlePage, onMiddleClick }: DashboardBreadcrumbProps) {
  return (
    <nav className="dashboard-breadcrumb" aria-label="Breadcrumb">
      <Link to={homeTo}>Home</Link>
      {middlePage && <>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
        {onMiddleClick ? <button type="button" onClick={onMiddleClick}>{middlePage}</button> : <span>{middlePage}</span>}
      </>}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
      <span aria-current="page">{currentPage}</span>
    </nav>
  );
}
