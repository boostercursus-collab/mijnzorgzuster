import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthProvider';
import { logOut } from '../firebase';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Briefcase, 
  Clock, 
  LogOut,
  Menu,
  X,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';

const Layout: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // De nieuwe logo URL
  const logoUrl = "https://mijnzorgzuster.nl/wp-content/uploads/2026/03/cropped-MIJNZORGZUSTER-2.jpg";

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['admin', 'zzp'] },
    { name: 'Urenregistratie', path: '/uren', icon: Clock, roles: ['admin', 'zzp'] },
    { name: 'Opdrachtgevers', path: '/opdrachtgevers', icon: Building2, roles: ['admin'] },
    { name: 'Opdrachten', path: '/opdrachten', icon: Briefcase, roles: ['admin'] },
    { name: 'ZZP\'ers', path: '/zzp', icon: Users, roles: ['admin'] },
    { name: 'Rapportage', path: '/rapportage', icon: FileText, roles: ['admin'] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(profile?.role || ''));

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar for Desktop */}
      <aside className="hidden w-64 flex-col border-r bg-white md:flex">
        <div className="flex h-20 items-center justify-center border-b p-4">
          <img 
            src={logoUrl} 
            alt="Mijn Zorgzuster" 
            className="h-12 object-contain"
          />
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {filteredMenu.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === item.path
                  ? "bg-pink-50 text-pink-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span>Uitloggen</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 md:hidden">
          <img 
            src={logoUrl} 
            alt="Mijn Zorgzuster" 
            className="h-8 object-contain"
          />
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-white md:hidden">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <img 
                src={logoUrl} 
                alt="Mijn Zorgzuster" 
                className="h-8 object-contain"
              />
              <button onClick={() => setIsMobileMenuOpen(false)}>
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="space-y-1 p-4">
              {filteredMenu.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center space-x-3 rounded-lg px-3 py-3 text-base font-medium transition-colors",
                    location.pathname === item.path
                      ? "bg-pink-50 text-pink-600"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <item.icon className="h-6 w-6" />
                  <span>{item.name}</span>
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="flex w-full items-center space-x-3 rounded-lg px-3 py-3 text-base font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <LogOut className="h-6 w-6" />
                <span>Uitloggen</span>
              </button>
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
