<?php
declare(strict_types=1);

// Web Station : index.php si prioritaire ; sinon index.html sert la welcome.
header('Location: index.html', true, 302);
exit;
