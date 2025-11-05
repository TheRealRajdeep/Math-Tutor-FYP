import { Link } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/constants';
import NavItems from './NavItems';
import UserDropdown from './UserDropdown';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Sidebar from './Sidebar';

const Header = () => {
  return (
    <header className="header">
      <div className="header-wrapper">
        <div className="flex items-center gap-4">
          {/* Mobile Menu Button */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <Sidebar />
            </SheetContent>
          </Sheet>
          
          <Link to="/dashboard" className="flex items-center">
            <img 
              src="/ChatGPT Image Nov 5, 2025, 04_39_40 PM.png" 
              alt="Math Tutor Logo" 
              className="h-10 w-auto cursor-pointer"
            />
          </Link>
        </div>
        
        <nav className="hidden md:block">
          <NavItems />
        </nav>
        
        <UserDropdown />
      </div>
    </header>
  );
};

export default Header;

