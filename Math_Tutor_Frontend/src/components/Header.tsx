import { Link } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/constants';
import NavItems from './NavItems';
import UserDropdown from './UserDropdown';

const Header = () => {
  return (
    <header className="header">
      <div className="header-wrapper">
        <Link to="/dashboard">
          <span className="text-xl font-bold cursor-pointer">
            Math Tutor
          </span>
        </Link>
        
        <nav className="hidden sm:block">
          <NavItems />
        </nav>
        
        <UserDropdown />
      </div>
    </header>
  );
};

export default Header;

