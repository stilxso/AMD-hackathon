import torch
import torch.nn as nn
from torchvision import datasets, transforms
from torch.utils.data import DataLoader
from PIL import Image
import timm

# 1. Setup Environment and Parameters
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
IMG_SIZE = 224
NUM_CLASSES = 5
class_names = ['class_0', 'class_1', 'class_2', 'class_3', 'class_4']  # Update with your classes

# 2. Rebuild and Load the Fine-Tuned Model Weights
model = timm.create_model('efficientnet_b0', pretrained=False)
model.classifier = nn.Linear(model.classifier.in_features, NUM_CLASSES)
model.load_state_dict(torch.load('best_efficientnet_model.pth'))  # Path to your saved weights
model = model.to(device)
model.eval()  # Crucial: Sets dropout and batchnorm to evaluation mode

# 3. Define the Test Transformation
test_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# --- SCENARIO A: Evaluate on a Test Dataset ---
test_dataset = datasets.ImageFolder(root='path/to/test_data', transform=test_transform)
test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False)

correct = 0
total = 0

with torch.no_grad():  # Turn off gradients to save memory and speed up
    for images, labels in test_loader:
        images, labels = images.to(device), labels.to(device)
        outputs = model(images)
        _, predicted = torch.max(outputs, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()

print(f"Overall Dataset Accuracy: {(100 * correct / total):.2f}%")


def predict_single_image(image_path):
    image = Image.open(image_path).convert('RGB')
    image_tensor = test_transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(image_tensor)
        probabilities = torch.nn.functional.softmax(outputs, dim=1)
        confidence, predicted_idx = torch.max(probabilities, 1)

    return class_names[predicted_idx.item()], confidence.item()

# Example usage:
# print(predict_single_image('path/to/test_image.jpg'))
