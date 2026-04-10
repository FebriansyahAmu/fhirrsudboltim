import LoginFooter from "./components/Login/LoginFooter";
import LoginForm from "./components/Login/LoginForm";
import LoginHeader from "./components/Login/LoginHeader";

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <LoginHeader />
        <LoginForm />
        <LoginFooter />
      </div>
    </div>
  );
}
