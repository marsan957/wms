from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

# Filter out empty lines and comments
install_requires = [pkg for pkg in install_requires if pkg.strip() and not pkg.startswith("#")]

setup(
    name="wms",
    version="0.0.1",
    description="Warehouse Management System Optimization for ERPNext",
    author="Your Company",
    author_email="your@email.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
    python_requires=">=3.10"
)
