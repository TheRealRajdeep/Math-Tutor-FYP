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
    <ul className="flex flex-col sm:flex-row p-2 gap-3 sm:gap-10 font-medium">
      {NAV_ITEMS.map(({ href, label }) => (
        <li key={href}>
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

