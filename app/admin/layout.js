export const metadata = {
  title: 'Oasis · Panel Admin',
  description: 'Panel gerencial de Oasis Pádel Club',
};

// El layout solo envuelve; el shell visual (header + pestañas) vive en page.js
// porque necesita interactividad de cliente. La pantalla de login se renderiza
// standalone dentro de este mismo layout.
export default function AdminLayout({ children }) {
  return children;
}
