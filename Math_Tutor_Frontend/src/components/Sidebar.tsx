import { Link, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const Sidebar = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="sidebar md:fixed md:left-0 md:top-16 md:h-[calc(100vh-4rem)] md:w-64 md:border-r md:bg-sidebar md:overflow-y-auto">
      <nav className="p-4 space-y-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            to={href}
            className={cn(
              'nav-item',
              isActive(href) && 'nav-item-active'
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;

