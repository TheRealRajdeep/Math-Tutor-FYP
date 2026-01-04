import { useLocation, Link } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const NavItems = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <ul className="flex flex-row p-2 gap-4 lg:gap-6 xl:gap-10 font-medium whitespace-nowrap overflow-x-auto scrollbar-hide">
      {NAV_ITEMS.map(({ href, label }) => (
        <li key={href} className="flex flex-shrink-0">
          <Link
            to={href}
            className={cn(
              'hover:text-primary transition-colors',
              isActive(href) ? 'text-foreground font-semibold' : 'text-muted-foreground'
            )}
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default NavItems;

